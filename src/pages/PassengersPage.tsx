import { useEffect, useState } from 'react'
import { Users, Plus, Pencil, Trash2, Search, Baby, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Passenger, DocumentType, Congregation } from '../types'
import { logAction } from '../lib/audit'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import { HelpIcon } from '../components/ui/Tooltip'
import { formatDocumentType } from '../lib/utils'
import toast from 'react-hot-toast'

const DOC_OPTIONS = [
  { value: 'cpf', label: 'CPF' },
  { value: 'rg', label: 'RG' },
  { value: 'birth_certificate', label: 'Certidão de Nascimento' },
]

export function PassengersPage() {
  const { isAdminGeneral, congregationIds, user } = useAuth()
  const [passengers, setPassengers] = useState<(Passenger & { guardian?: Passenger; congregation?: Congregation })[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Passenger | null>(null)
  const [deleting, setDeleting] = useState<Passenger | null>(null)
  const [filterCong, setFilterCong] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    let cQuery = supabase.from('congregations').select('*').order('name')
    if (!isAdminGeneral && congregationIds.length > 0) cQuery = cQuery.in('id', congregationIds)
    const { data: congs } = await cQuery
    setCongregations(congs ?? [])

    const congIds = (congs ?? []).map(c => c.id)
    let pQuery = supabase.from('passengers').select('*, guardian:guardian_id(*)').order('full_name')
    if (congIds.length > 0) pQuery = pQuery.in('congregation_id', congIds)
    const { data } = await pQuery

    const enriched = (data ?? []).map((p: any) => ({
      ...p,
      congregation: congs?.find(c => c.id === p.congregation_id),
    }))
    setPassengers(enriched)
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('passengers').delete().eq('id', deleting.id)
    if (error) {
      toast.error('Não é possível excluir: passageiro pode estar em uso')
    } else {
      await logAction({
        congregationId: deleting.congregation_id,
        actionType: 'passenger_deleted',
        description: `Passageiro "${deleting.full_name}" removido`,
        performedBy: user!.id,
      })
      toast.success('Passageiro excluído')
      setDeleting(null)
      loadData()
    }
  }

  const filtered = passengers.filter(p => {
    const matchSearch = !search ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.document_number.includes(search) ||
      (p.guardian as any)?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchCong = !filterCong || p.congregation_id === filterCong
    return matchSearch && matchCong
  })

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Passageiros"
        subtitle="Cadastre e gerencie os passageiros"
        icon={<Users className="w-6 h-6" />}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
            Novo Passageiro
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Pesquisar por nome, documento ou responsável..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          {isAdminGeneral && congregations.length > 1 && (
            <Select
              options={[{ value: '', label: 'Todas congregações' }, ...congregations.map(c => ({ value: c.id, label: c.name }))]}
              value={filterCong}
              onChange={e => setFilterCong(e.target.value)}
              className="sm:w-52"
            />
          )}
          <HelpIcon content="Pesquise por nome completo, número do documento ou nome do responsável. Clique em um passageiro para ver mais detalhes." />
        </div>

        {loading ? (
          <Spinner className="py-10" label="Carregando passageiros..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum passageiro encontrado</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-stone-100 dark:divide-stone-700">
            {filtered.map(p => (
              <div key={p.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                      {p.full_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-stone-700 dark:text-stone-200 text-sm">{p.full_name}</p>
                      {p.is_minor && <Badge variant="warning" dot><Baby className="w-3 h-3" /> Menor</Badge>}
                      {isAdminGeneral && p.congregation && (
                        <Badge variant="neutral">{p.congregation.name}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-stone-400">
                      {formatDocumentType(p.document_type)} · {p.document_number}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil className="w-3.5 h-3.5" />}
                      onClick={() => { setEditing(p); setShowForm(true) }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      onClick={() => setDeleting(p)}
                    />
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {expanded === p.id && (
                  <div className="mt-3 ml-12 p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl text-sm animate-fade-in">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-stone-400">Tipo de Documento</p>
                        <p className="text-stone-700 dark:text-stone-200">{formatDocumentType(p.document_type)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-400">Número</p>
                        <p className="text-stone-700 dark:text-stone-200">{p.document_number}</p>
                      </div>
                      {p.is_minor && p.guardian && (
                        <>
                          <div className="col-span-2 mt-1 pt-2 border-t border-stone-200 dark:border-stone-600">
                            <p className="text-xs text-amber-600 font-medium mb-1">Responsável</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-400">Nome</p>
                            <p className="text-stone-700 dark:text-stone-200">{(p.guardian as any).full_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-stone-400">Documento</p>
                            <p className="text-stone-700 dark:text-stone-200">
                              {formatDocumentType((p.guardian as any).document_type)} · {(p.guardian as any).document_number}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <p className="text-xs text-stone-400 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700">
            {filtered.length} passageiro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </Card>

      <PassengerForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        congregations={congregations}
        passengers={passengers}
        onSaved={() => { setShowForm(false); loadData() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Excluir Passageiro"
        message={`Excluir "${deleting?.full_name}"? Se este passageiro estiver em um veículo, ele será removido também.`}
      />
    </div>
  )
}

// --- PassengerForm ---
interface PassengerFormProps {
  open: boolean; onClose: () => void; editing: Passenger | null
  congregations: Congregation[]; passengers: Passenger[]
  onSaved: () => void
}

function PassengerForm({ open, onClose, editing, congregations, passengers, onSaved }: PassengerFormProps) {
  const { isAdminGeneral, congregationIds, user } = useAuth()
  const [fullName, setFullName] = useState('')
  const [docType, setDocType] = useState<DocumentType>('cpf')
  const [docNumber, setDocNumber] = useState('')
  const [isMinor, setIsMinor] = useState(false)
  const [guardianId, setGuardianId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFullName(editing?.full_name ?? '')
    setDocType(editing?.document_type ?? 'cpf')
    setDocNumber(editing?.document_number ?? '')
    setIsMinor(editing?.is_minor ?? false)
    setGuardianId(editing?.guardian_id ?? '')
    setCongregationId(editing?.congregation_id ?? (isAdminGeneral ? '' : congregationIds[0] ?? ''))
  }, [editing, open])

  const adultPassengers = passengers.filter(p => !p.is_minor && p.id !== editing?.id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        full_name: fullName,
        document_type: docType,
        document_number: docNumber,
        is_minor: isMinor,
        guardian_id: isMinor && guardianId ? guardianId : null,
        congregation_id: congregationId,
      }

      if (editing) {
        const { error } = await supabase.from('passengers').update(payload).eq('id', editing.id)
        if (error) throw error
        await logAction({
          congregationId: congregationId,
          actionType: 'passenger_updated',
          description: `Dados de "${fullName}" atualizados`,
          performedBy: user!.id,
        })
        toast.success('Passageiro atualizado')
      } else {
        const { error } = await supabase.from('passengers').insert(payload)
        if (error) throw error
        await logAction({
          congregationId: congregationId,
          actionType: 'passenger_created',
          description: `Passageiro "${fullName}" cadastrado`,
          performedBy: user!.id,
        })
        toast.success('Passageiro cadastrado')
      }
      onSaved()
    } catch {
      toast.error('Erro ao salvar passageiro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Passageiro' : 'Novo Passageiro'} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isAdminGeneral && (
          <Select
            label="Congregação"
            value={congregationId}
            onChange={e => setCongregationId(e.target.value)}
            options={congregations.map(c => ({ value: c.id, label: c.name }))}
            placeholder="Selecione..."
            required
          />
        )}

        <Input
          label="Nome Completo"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Nome completo do passageiro"
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de Documento"
            value={docType}
            onChange={e => setDocType(e.target.value as DocumentType)}
            options={DOC_OPTIONS}
            required
          />
          <Input
            label="Número do Documento"
            value={docNumber}
            onChange={e => setDocNumber(e.target.value)}
            placeholder="000.000.000-00"
            required
          />
        </div>

        <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
          <input
            type="checkbox"
            id="is-minor"
            checked={isMinor}
            onChange={e => setIsMinor(e.target.checked)}
            className="w-4 h-4 accent-amber-400"
          />
          <label htmlFor="is-minor" className="text-sm font-medium text-stone-700 dark:text-stone-200 cursor-pointer flex-1">
            Menor de idade
          </label>
          <HelpIcon content="Marque esta opção caso o passageiro seja menor de 18 anos. Será obrigatório informar um responsável adulto." />
        </div>

        {isMinor && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex flex-col gap-3 animate-fade-in">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Dados do Responsável</p>
            <Select
              label="Responsável"
              value={guardianId}
              onChange={e => setGuardianId(e.target.value)}
              options={adultPassengers.map(p => ({ value: p.id, label: p.full_name }))}
              placeholder="Selecione o responsável..."
              hint="Selecione um passageiro adulto já cadastrado como responsável"
            />
            {adultPassengers.length === 0 && (
              <p className="text-xs text-amber-600">
                ⚠️ Nenhum passageiro adulto cadastrado ainda. Cadastre o responsável primeiro.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">
            {editing ? 'Salvar' : 'Cadastrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
