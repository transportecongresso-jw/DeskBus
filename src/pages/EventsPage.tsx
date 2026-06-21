import { useEffect, useState } from 'react'
import { CalendarDays, Plus, Trash2, Pencil, Building2, X, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Event, EventDay, EventStatus, Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

const DAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'closed', label: 'Encerrado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const STATUS_BADGE: Record<EventStatus, 'success' | 'neutral' | 'danger'> = {
  active: 'success',
  closed: 'neutral',
  cancelled: 'danger',
}

const STATUS_LABEL: Record<EventStatus, string> = {
  active: 'Ativo',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
}

function dateRange(start: string, end: string): Date[] {
  const dates: Date[] = []
  const cur = new Date(start + 'T12:00:00')
  const last = new Date(end + 'T12:00:00')
  while (cur <= last) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return dates
}

interface EventWithData extends Event {
  days: EventDay[]
  congregations: Congregation[]
}

export function EventsPage() {
  const { user } = useAuth()
  const { reload: reloadCtx } = useEvent()
  const [events, setEvents] = useState<EventWithData[]>([])
  const [allCongregations, setAllCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EventWithData | null>(null)
  const [deleting, setDeleting] = useState<EventWithData | null>(null)
  const [showCongModal, setShowCongModal] = useState<EventWithData | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [status, setStatus] = useState<EventStatus>('active')
  const [notes, setNotes] = useState('')
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: evs }, { data: congs }] = await Promise.all([
      supabase.from('events').select('*').order('start_date'),
      supabase.from('congregations').select('*').order('name'),
    ])
    setAllCongregations(congs ?? [])

    if (!evs || evs.length === 0) { setEvents([]); setLoading(false); return }

    const [{ data: days }, { data: ec }] = await Promise.all([
      supabase.from('event_days').select('*').in('event_id', evs.map(e => e.id)).order('day_order'),
      supabase.from('event_congregations').select('*, congregation:congregations(*)').in('event_id', evs.map(e => e.id)),
    ])

    setEvents(evs.map(e => ({
      ...e,
      days: (days ?? []).filter(d => d.event_id === e.id),
      congregations: (ec ?? []).filter((r: any) => r.event_id === e.id).map((r: any) => r.congregation),
    })))
    setLoading(false)
  }

  function openCreate() {
    setEditing(null); setName(''); setStartDate(''); setEndDate('')
    setStatus('active'); setNotes(''); setDayLabels({}); setShowForm(true)
  }

  function openEdit(ev: EventWithData) {
    setEditing(ev); setName(ev.name); setStartDate(ev.start_date); setEndDate(ev.end_date)
    setStatus(ev.status); setNotes(ev.notes ?? '')
    const labels: Record<string, string> = {}
    ev.days.forEach(d => { labels[d.date] = d.label })
    setDayLabels(labels); setShowForm(true)
  }

  const previewDates = startDate && endDate ? dateRange(startDate, endDate) : []

  function getLabel(date: Date) {
    const key = date.toISOString().slice(0, 10)
    return dayLabels[key] ?? DAY_LABELS[date.getDay()]
  }
  function setLabel(date: Date, label: string) {
    setDayLabels(prev => ({ ...prev, [date.toISOString().slice(0, 10)]: label }))
  }

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate) { toast.error('Preencha todos os campos obrigatórios'); return }
    if (startDate > endDate) { toast.error('Data inicial deve ser anterior à data final'); return }
    setSaving(true)
    try {
      let eventId: string
      const payload = { name: name.trim(), start_date: startDate, end_date: endDate, status, notes: notes || null }
      if (editing) {
        await supabase.from('events').update(payload).eq('id', editing.id)
        await supabase.from('event_days').delete().eq('event_id', editing.id)
        eventId = editing.id
      } else {
        const { data } = await supabase.from('events').insert({ ...payload, created_by: user?.id }).select().single()
        eventId = data.id
      }
      const days = previewDates.map((d, i) => ({ event_id: eventId, date: d.toISOString().slice(0, 10), label: getLabel(d), day_order: i }))
      if (days.length > 0) await supabase.from('event_days').insert(days)
      toast.success(editing ? 'Evento atualizado' : 'Evento criado')
      setShowForm(false); loadAll(); reloadCtx()
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!deleting) return
    await supabase.from('events').delete().eq('id', deleting.id)
    toast.success('Evento excluído'); setDeleting(null); loadAll(); reloadCtx()
  }

  async function toggleCongregation(ev: EventWithData, congId: string) {
    const linked = ev.congregations.some(c => c.id === congId)
    if (linked) {
      await supabase.from('event_congregations').delete().eq('event_id', ev.id).eq('congregation_id', congId)
    } else {
      await supabase.from('event_congregations').insert({ event_id: ev.id, congregation_id: congId })
    }
    loadAll()
  }

  if (loading) return <div className="flex justify-center p-10"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Congressos e assembleias — múltiplos eventos simultâneos"
        icon={<CalendarDays className="w-5 h-5" />}
        actions={<Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1" />Novo Evento</Button>}
      />

      {events.length === 0 ? (
        <Card className="p-12 text-center text-stone-500">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="mb-4">Nenhum evento cadastrado</p>
          <Button onClick={openCreate}>Criar primeiro evento</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map(ev => (
            <Card key={ev.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100 text-lg">{ev.name}</h3>
                    <Badge variant={STATUS_BADGE[ev.status]}>{STATUS_LABEL[ev.status]}</Badge>
                  </div>
                  <p className="text-sm text-stone-500">
                    {new Date(ev.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} — {new Date(ev.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                  {ev.notes && <p className="text-xs text-stone-400 mt-1">{ev.notes}</p>}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {ev.days.map(d => (
                      <span key={d.id} className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-600 dark:text-stone-300">
                        {d.label}
                      </span>
                    ))}
                  </div>

                  {/* Congregações vinculadas */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-stone-400">Congregações:</span>
                    {ev.congregations.length === 0 ? (
                      <span className="text-xs text-stone-400 italic">Nenhuma vinculada</span>
                    ) : ev.congregations.map(c => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Building2 className="w-3 h-3" />{c.name}
                      </span>
                    ))}
                    <button
                      onClick={() => setShowCongModal(ev)}
                      className="text-xs text-amber-600 hover:text-amber-700 underline"
                    >
                      Gerenciar
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(ev)} className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800">
                    <Pencil className="w-4 h-4 text-stone-500" />
                  </button>
                  <button onClick={() => setDeleting(ev)} className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20">
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Editar Evento' : 'Novo Evento'}
        size="lg"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              {editing ? 'Salvar' : 'Criar Evento'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Nome do Evento *" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Congresso Regional 2026" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data Inicial *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="Data Final *" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <Select label="Status" value={status} onChange={e => setStatus(e.target.value as EventStatus)} options={STATUS_OPTIONS} />
          <Input label="Observações" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional..." />

          {previewDates.length > 0 && (
            <div>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Dias do evento</p>
              <div className="space-y-2">
                {previewDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 w-20 flex-shrink-0">{d.toLocaleDateString('pt-BR')}</span>
                    <input type="text" value={getLabel(d)} onChange={e => setLabel(d, e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Congregation linking modal */}
      {showCongModal && (
        <Modal
          open={!!showCongModal}
          onClose={() => { setShowCongModal(null); loadAll() }}
          title={`Congregações — ${showCongModal.name}`}
          size="md"
          footer={
            <Button onClick={() => { setShowCongModal(null); loadAll() }} className="w-full">Fechar</Button>
          }
        >
          <div className="space-y-2">
            {allCongregations.map(c => {
              const linked = showCongModal.congregations.some(sc => sc.id === c.id)
              return (
                <button key={c.id} onClick={() => toggleCongregation(showCongModal, c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left active:scale-[0.99] ${
                    linked ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-stone-200 dark:border-stone-700 hover:border-amber-200'
                  }`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${linked ? 'border-amber-400 bg-amber-400' : 'border-stone-300'}`}>
                    {linked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{c.name}</p>
                    {c.city && <p className="text-xs text-stone-400">{c.city}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </Modal>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)}
        title="Excluir Evento" message={`Excluir "${deleting?.name}"?`} onConfirm={handleDelete} />
    </div>
  )
}
