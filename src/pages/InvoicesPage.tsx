import { useEffect, useRef, useState } from 'react'
import { Receipt, Upload, Check, Eye, Filter, Plus, X, DollarSign, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Invoice, Vehicle, Congregation, TransportCompany } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

interface InvoiceWithContext extends Invoice {
  vehicle?: Vehicle
  congregation?: Congregation
  company?: TransportCompany
}

const STATUS_LABEL: Record<string, string> = { sent: 'Enviada', reviewed: 'Revisada' }
const STATUS_VARIANT: Record<string, any> = { sent: 'warning', reviewed: 'success' }

export function InvoicesPage() {
  const { isAdminGeneral, congregationIds, user } = useAuth()
  const { selectedEvent } = useEvent()
  const [invoices, setInvoices] = useState<InvoiceWithContext[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [companies, setCompanies] = useState<TransportCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCong, setFilterCong] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => { loadData() }, [selectedEvent])

  async function loadData() {
    setLoading(true)
    const [{ data: comps }, { data: congs }] = await Promise.all([
      supabase.from('transport_companies').select('*').order('name'),
      supabase.from('congregations').select('*').order('name'),
    ])
    setCompanies(comps ?? [])
    setCongregations(congs ?? [])

    let vQuery = supabase.from('vehicles').select('*')
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    if (!isAdminGeneral && congregationIds.length > 0) vQuery = vQuery.in('congregation_id', congregationIds)
    const { data: vData } = await vQuery
    setVehicles(vData ?? [])

    let iQuery = supabase.from('invoices').select('*').order('created_at', { ascending: false })
    if (selectedEvent) iQuery = iQuery.eq('event_id', selectedEvent.id)
    if (!isAdminGeneral && congregationIds.length > 0) iQuery = iQuery.in('congregation_id', congregationIds)
    const { data: iData } = await iQuery

    const enriched: InvoiceWithContext[] = (iData ?? []).map(inv => ({
      ...inv,
      vehicle: (vData ?? []).find(v => v.id === inv.vehicle_id),
      congregation: (congs ?? []).find(c => c.id === inv.congregation_id),
      company: (comps ?? []).find(c => c.id === inv.transport_company_id),
    }))
    setInvoices(enriched)
    setLoading(false)
  }

  async function markReviewed(invoiceId: string) {
    const { error } = await supabase.from('invoices').update({
      status: 'reviewed', reviewed_by: user?.id, reviewed_at: new Date().toISOString()
    }).eq('id', invoiceId)
    if (error) { toast.error('Erro ao atualizar status'); return }
    toast.success('Nota marcada como revisada')
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'reviewed' } : i))
  }

  const filtered = invoices
    .filter(i => !filterStatus || i.status === filterStatus)
    .filter(i => !filterCong || i.congregation_id === filterCong)

  const totalAmount = filtered.reduce((s, i) => s + Number(i.amount), 0)
  const sent = invoices.filter(i => i.status === 'sent').length
  const reviewed = invoices.filter(i => i.status === 'reviewed').length

  return (
    <div className="animate-fade-in space-y-5">
      <PageHeader
        title="Notas Fiscais"
        subtitle="Centralize o envio e controle das notas fiscais de transporte"
        icon={<Receipt className="w-6 h-6" />}
        actions={
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => setShowForm(true)}>
            Enviar Nota
          </Button>
        }
      />

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total" value={invoices.length.toString()} icon={<FileText className="w-5 h-5" />} color="stone" />
        <StatCard label="Enviadas" value={sent.toString()} icon={<Upload className="w-5 h-5" />} color="amber" />
        <StatCard label="Revisadas" value={reviewed.toString()} icon={<Check className="w-5 h-5" />} color="emerald" />
        <StatCard label="Valor Total" value={formatCurrency(totalAmount)} icon={<DollarSign className="w-5 h-5" />} color="blue" />
      </div>

      {loading ? (
        <Spinner className="py-20" label="Carregando notas..." />
      ) : (
        <>
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                options={[
                  { value: '', label: 'Todos os status' },
                  { value: 'sent', label: 'Enviadas' },
                  { value: 'reviewed', label: 'Revisadas' },
                ]} />
            </div>
            {isAdminGeneral && (
              <Select value={filterCong} onChange={e => setFilterCong(e.target.value)}
                options={[
                  { value: '', label: 'Todas as congregações' },
                  ...congregations.map(c => ({ value: c.id, label: c.name })),
                ]} />
            )}
          </div>

          {/* Lista */}
          {filtered.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <Receipt className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">Nenhuma nota fiscal encontrada</p>
                <Button className="mt-4" icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>
                  Enviar Primeira Nota
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map(inv => (
                <div key={inv.id} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={STATUS_VARIANT[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                        {inv.company && <Badge variant="info">{inv.company.name}</Badge>}
                      </div>
                      {inv.congregation && (
                        <p className="font-semibold text-stone-800 dark:text-stone-100">{inv.congregation.name}</p>
                      )}
                      {inv.vehicle && (
                        <p className="text-xs text-stone-400 mt-0.5">{inv.vehicle.name}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-stone-800 dark:text-stone-100">{formatCurrency(Number(inv.amount))}</p>
                      <p className="text-xs text-stone-400">{new Date(inv.invoice_date).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>

                  {(inv.invoice_number || inv.notes) && (
                    <div className="mb-3 space-y-0.5">
                      {inv.invoice_number && <p className="text-xs text-stone-400">NF: {inv.invoice_number}</p>}
                      {inv.notes && <p className="text-xs text-stone-500 dark:text-stone-400 italic">"{inv.notes}"</p>}
                    </div>
                  )}

                  <div className="flex gap-2 pt-3 border-t border-stone-100 dark:border-stone-700 flex-wrap">
                    {inv.file_url && (
                      <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />}
                        onClick={() => setPreviewUrl(inv.file_url)}>
                        Ver Nota
                      </Button>
                    )}
                    {isAdminGeneral && inv.status === 'sent' && (
                      <Button variant="ghost" size="sm" icon={<Check className="w-4 h-4" />}
                        className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        onClick={() => markReviewed(inv.id)}>
                        Marcar Revisada
                      </Button>
                    )}
                    {inv.file_name && (
                      <span className="text-xs text-stone-400 self-center">{inv.file_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Formulário de envio */}
      <InvoiceForm
        open={showForm}
        onClose={() => setShowForm(false)}
        vehicles={vehicles}
        congregations={congregations}
        companies={companies}
        congregationIds={congregationIds}
        isAdminGeneral={isAdminGeneral}
        userId={user?.id ?? ''}
        eventId={selectedEvent?.id ?? null}
        onSaved={() => { setShowForm(false); loadData() }}
      />

      {/* Preview de arquivo */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative bg-white dark:bg-stone-900 rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
              <p className="font-semibold text-stone-800 dark:text-stone-100">Visualizar Nota Fiscal</p>
              <button onClick={() => setPreviewUrl(null)} className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {previewUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={previewUrl} alt="Nota Fiscal" className="max-w-full mx-auto rounded-xl" />
              ) : (
                <iframe src={previewUrl} title="Nota Fiscal" className="w-full h-[70vh] rounded-xl border border-stone-200 dark:border-stone-700" />
              )}
            </div>
            <div className="p-3 border-t border-stone-200 dark:border-stone-700">
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">Abrir em nova aba</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceForm({ open, onClose, vehicles, congregations, companies, congregationIds, isAdminGeneral, userId, eventId, onSaved }: {
  open: boolean; onClose: () => void; vehicles: Vehicle[]; congregations: Congregation[]
  companies: TransportCompany[]; congregationIds: string[]; isAdminGeneral: boolean
  userId: string; eventId: string | null; onSaved: () => void
}) {
  const [congregationId, setCongregationId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setCongregationId(!isAdminGeneral && congregationIds.length > 0 ? congregationIds[0] : '')
      setVehicleId(''); setCompanyId(''); setInvoiceNumber('')
      setAmount(''); setNotes(''); setFile(null)
      setInvoiceDate(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  // Auto-preencher empresa ao selecionar veículo
  function handleVehicleChange(vid: string) {
    setVehicleId(vid)
    const v = vehicles.find(v => v.id === vid)
    if (v?.transport_company_id) setCompanyId(v.transport_company_id)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!congregationId) { toast.error('Selecione a congregação'); return }
    if (!amount || isNaN(parseFloat(amount))) { toast.error('Informe o valor da nota'); return }
    setUploading(true)

    let fileUrl: string | null = null
    let fileName: string | null = null

    if (file) {
      const ext = file.name.split('.').pop()
      const path = `${congregationId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('invoices').upload(path, file)
      if (uploadError) {
        toast.error('Erro ao fazer upload do arquivo. Verifique se o bucket "invoices" existe no Supabase Storage.')
        setUploading(false)
        return
      }
      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(path)
      fileUrl = urlData.publicUrl
      fileName = file.name
    }

    const payload = {
      congregation_id: congregationId,
      vehicle_id: vehicleId || null,
      event_id: eventId,
      transport_company_id: companyId || null,
      invoice_date: invoiceDate,
      invoice_number: invoiceNumber || null,
      amount: parseFloat(amount),
      notes: notes || null,
      file_url: fileUrl,
      file_name: fileName,
      status: 'sent' as const,
      uploaded_by: userId,
    }

    const { error } = await supabase.from('invoices').insert(payload)
    if (error) { toast.error('Erro ao registrar nota fiscal'); setUploading(false); return }
    toast.success('Nota fiscal enviada!')
    setUploading(false)
    onSaved()
  }

  const availableCongreg = isAdminGeneral
    ? congregations
    : congregations.filter(c => congregationIds.includes(c.id))

  const congVehicles = vehicles.filter(v => !congregationId || v.congregation_id === congregationId)

  return (
    <Modal open={open} onClose={onClose} title="Enviar Nota Fiscal" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isAdminGeneral && (
          <Select label="Congregação" value={congregationId} onChange={e => { setCongregationId(e.target.value); setVehicleId('') }}
            options={availableCongreg.map(c => ({ value: c.id, label: c.name }))} placeholder="Selecione..." required />
        )}

        <Select label="Veículo (opcional)" value={vehicleId} onChange={e => handleVehicleChange(e.target.value)}
          options={[
            { value: '', label: 'Nenhum veículo específico' },
            ...congVehicles.map(v => ({ value: v.id, label: v.name })),
          ]} />

        <Select label="Empresa de Transporte (opcional)" value={companyId} onChange={e => setCompanyId(e.target.value)}
          options={[
            { value: '', label: 'Selecionar empresa...' },
            ...companies.map(c => ({ value: c.id, label: c.name })),
          ]} />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Data da Nota" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
          <Input label="Número da NF (opcional)" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ex: 001234" />
        </div>

        <Input label="Valor (R$)" type="number" step="0.01" min="0" value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="0,00" required />

        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Observações (opcional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Referente ao transporte do dia..."
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>

        {/* Upload de arquivo */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Arquivo da Nota (PDF, JPG, PNG)</label>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
              <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-stone-300 dark:border-stone-600 rounded-xl hover:border-amber-400 transition-colors text-stone-400 hover:text-amber-500">
              <Upload className="w-6 h-6" />
              <span className="text-sm">Clique para selecionar o arquivo</span>
              <span className="text-xs">PDF, JPG ou PNG</span>
            </button>
          )}
        </div>

        <div className="flex gap-3 mt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={uploading} className="flex-1" icon={<Upload className="w-4 h-4" />}>
            Enviar Nota
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    stone: 'bg-stone-50 dark:bg-stone-700/50 text-stone-500',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  }
  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-stone-800 dark:text-stone-100 leading-none truncate">{value}</p>
          <p className="text-xs text-stone-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}
