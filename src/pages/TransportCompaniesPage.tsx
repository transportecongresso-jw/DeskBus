import { useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, Phone, User, FileText, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TransportCompany } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import toast from 'react-hot-toast'

interface CompanyWithStats extends TransportCompany {
  vehicleCount: number
  avgRating: number | null
  ratingCount: number
}

export function TransportCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TransportCompany | null>(null)
  const [deleting, setDeleting] = useState<TransportCompany | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: comps } = await supabase.from('transport_companies').select('*').order('name')
    if (!comps) { setLoading(false); return }

    const ids = comps.map(c => c.id)

    const [{ data: vehicles }, { data: ratings }] = await Promise.all([
      ids.length > 0
        ? supabase.from('vehicles').select('id, transport_company_id').in('transport_company_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length > 0
        ? supabase.from('vehicle_ratings').select('id, overall_stars, vehicle_id').in('vehicle_id',
            (await supabase.from('vehicles').select('id').in('transport_company_id', ids)).data?.map(v => v.id) ?? []
          )
        : Promise.resolve({ data: [] }),
    ])

    const withStats: CompanyWithStats[] = comps.map(c => {
      const vIds = (vehicles ?? []).filter(v => v.transport_company_id === c.id).map(v => v.id)
      const compRatings = (ratings ?? []).filter(r => vIds.includes(r.vehicle_id))
      const avgRating = compRatings.length > 0
        ? compRatings.reduce((sum, r) => sum + r.overall_stars, 0) / compRatings.length
        : null
      return { ...c, vehicleCount: vIds.length, avgRating, ratingCount: compRatings.length }
    })

    setCompanies(withStats)
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('transport_companies').delete().eq('id', deleting.id)
    if (error) { toast.error('Erro ao excluir empresa'); return }
    toast.success('Empresa excluída')
    setDeleting(null)
    loadData()
  }

  const sorted = [...companies].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Empresas de Transporte"
        subtitle="Gerencie as empresas contratadas e acompanhe as avaliações"
        icon={<Building2 className="w-6 h-6" />}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
            Nova Empresa
          </Button>
        }
      />

      {loading ? (
        <Spinner className="py-20" label="Carregando empresas..." />
      ) : companies.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-medium text-stone-600 dark:text-stone-300 mb-1">Nenhuma empresa cadastrada</h3>
            <p className="text-sm text-stone-400 mb-4">Cadastre as empresas de transporte para vinculá-las aos veículos</p>
            <Button onClick={() => setShowForm(true)} icon={<Plus className="w-4 h-4" />}>Cadastrar Empresa</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Ranking */}
          {sorted.some(c => c.ratingCount > 0) && (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wide mb-3">Ranking por Avaliação</h2>
              <div className="space-y-2">
                {sorted.filter(c => c.ratingCount > 0).map((c, i) => (
                  <div key={c.id} className="flex items-center gap-4 p-3 bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      i === 0 ? 'bg-amber-400 text-amber-950' :
                      i === 1 ? 'bg-stone-200 dark:bg-stone-600 text-stone-700 dark:text-stone-200' :
                      i === 2 ? 'bg-orange-200 text-orange-800' :
                      'bg-stone-100 dark:bg-stone-700 text-stone-500'
                    }`}>{i + 1}º</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 dark:text-stone-100 truncate">{c.name}</p>
                      <p className="text-xs text-stone-400">{c.ratingCount} avaliação{c.ratingCount !== 1 ? 'ões' : ''}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span className="font-bold text-stone-700 dark:text-stone-200">{c.avgRating!.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {companies.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100 truncate">{c.name}</h3>
                    {c.cnpj && <p className="text-xs text-stone-400 mt-0.5">CNPJ: {c.cnpj}</p>}
                  </div>
                  {c.avgRating !== null && (
                    <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg ml-2">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{c.avgRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 mb-4">
                  {c.contact_name && (
                    <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{c.contact_name}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{c.phone}</span>
                    </div>
                  )}
                  {c.notes && (
                    <div className="flex items-start gap-2 text-xs text-stone-500 dark:text-stone-400">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{c.notes}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <Badge variant="info">{c.vehicleCount} veículo{c.vehicleCount !== 1 ? 's' : ''}</Badge>
                  {c.ratingCount > 0
                    ? <Badge variant="success">{c.ratingCount} avaliação{c.ratingCount !== 1 ? 'ões' : ''}</Badge>
                    : <Badge variant="neutral">Sem avaliações</Badge>
                  }
                </div>

                <div className="flex gap-2 pt-3 border-t border-stone-100 dark:border-stone-700">
                  <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />}
                    onClick={() => { setEditing(c); setShowForm(true) }}>Editar</Button>
                  <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4" />}
                    className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    onClick={() => setDeleting(c)}>Excluir</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <CompanyForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        onSaved={() => { setShowForm(false); loadData() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Excluir Empresa"
        message={`Excluir "${deleting?.name}"? Os veículos vinculados perderão essa associação.`}
      />
    </div>
  )
}

function CompanyForm({ open, onClose, editing, onSaved }: {
  open: boolean; onClose: () => void; editing: TransportCompany | null; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [phone, setPhone] = useState('')
  const [contactName, setContactName] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editing) {
      setName(editing.name); setCnpj(editing.cnpj ?? ''); setPhone(editing.phone ?? '')
      setContactName(editing.contact_name ?? ''); setNotes(editing.notes ?? '')
    } else {
      setName(''); setCnpj(''); setPhone(''); setContactName(''); setNotes('')
    }
  }, [editing, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = { name, cnpj: cnpj || null, phone: phone || null, contact_name: contactName || null, notes: notes || null }
    const { error } = editing
      ? await supabase.from('transport_companies').update(payload).eq('id', editing.id)
      : await supabase.from('transport_companies').insert(payload)
    if (error) { toast.error('Erro ao salvar empresa'); setLoading(false); return }
    toast.success(editing ? 'Empresa atualizada' : 'Empresa cadastrada')
    setLoading(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Empresa' : 'Nova Empresa de Transporte'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome da Empresa" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: ABC Turismo" required />
        <Input label="CNPJ (opcional)" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
        <Input label="Telefone (opcional)" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
        <Input label="Nome do Contato (opcional)" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Ex: João Silva" />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Observações (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Informações adicionais sobre a empresa..."
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div className="flex gap-3 mt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">{editing ? 'Salvar' : 'Cadastrar'}</Button>
        </div>
      </form>
    </Modal>
  )
}
