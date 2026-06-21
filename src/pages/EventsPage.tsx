import { useEffect, useState } from 'react'
import { CalendarDays, Plus, Trash2, CheckCircle2, Circle, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Event, EventDay } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

const DAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function dateRange(start: string, end: string): Date[] {
  const dates: Date[] = []
  const cur = new Date(start + 'T12:00:00')
  const last = new Date(end + 'T12:00:00')
  while (cur <= last) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export function EventsPage() {
  const { user } = useAuth()
  const { reload: reloadContext } = useEvent()
  const [events, setEvents] = useState<(Event & { days: EventDay[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [deleting, setDeleting] = useState<Event | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dayLabels, setDayLabels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const { data: evs } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    if (!evs) { setLoading(false); return }
    const ids = evs.map(e => e.id)
    const { data: days } = ids.length > 0
      ? await supabase.from('event_days').select('*').in('event_id', ids).order('day_order')
      : { data: [] }
    setEvents(evs.map(e => ({ ...e, days: (days ?? []).filter(d => d.event_id === e.id) })))
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setName('')
    setStartDate('')
    setEndDate('')
    setDayLabels({})
    setShowForm(true)
  }

  function openEdit(ev: Event & { days: EventDay[] }) {
    setEditing(ev)
    setName(ev.name)
    setStartDate(ev.start_date)
    setEndDate(ev.end_date)
    const labels: Record<string, string> = {}
    ev.days.forEach(d => { labels[d.date] = d.label })
    setDayLabels(labels)
    setShowForm(true)
  }

  const previewDates = startDate && endDate ? dateRange(startDate, endDate) : []

  function getLabel(date: Date): string {
    const key = date.toISOString().slice(0, 10)
    return dayLabels[key] ?? DAY_LABELS[date.getDay()]
  }

  function setLabel(date: Date, label: string) {
    const key = date.toISOString().slice(0, 10)
    setDayLabels(prev => ({ ...prev, [key]: label }))
  }

  async function handleSave() {
    if (!name.trim() || !startDate || !endDate) { toast.error('Preencha todos os campos'); return }
    if (startDate > endDate) { toast.error('Data inicial deve ser anterior à data final'); return }
    setSaving(true)
    try {
      let eventId: string
      if (editing) {
        await supabase.from('events').update({ name: name.trim(), start_date: startDate, end_date: endDate }).eq('id', editing.id)
        await supabase.from('event_days').delete().eq('event_id', editing.id)
        eventId = editing.id
      } else {
        const { data } = await supabase.from('events').insert({ name: name.trim(), start_date: startDate, end_date: endDate, created_by: user?.id }).select().single()
        eventId = data.id
      }

      const days = previewDates.map((d, i) => ({
        event_id: eventId,
        date: d.toISOString().slice(0, 10),
        label: getLabel(d),
        day_order: i,
      }))
      await supabase.from('event_days').insert(days)

      toast.success(editing ? 'Evento atualizado' : 'Evento criado')
      setShowForm(false)
      loadEvents()
      reloadContext()
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    await supabase.from('events').delete().eq('id', deleting.id)
    toast.success('Evento excluído')
    setDeleting(null)
    loadEvents()
    reloadContext()
  }

  async function setActive(ev: Event) {
    await supabase.from('events').update({ is_active: false }).neq('id', ev.id)
    await supabase.from('events').update({ is_active: !ev.is_active }).eq('id', ev.id)
    toast.success(ev.is_active ? 'Evento desativado' : 'Evento ativado como atual')
    loadEvents()
    reloadContext()
  }

  if (loading) return <div className="flex justify-center p-10"><Spinner /></div>

  return (
    <div>
      <PageHeader
        title="Eventos"
        subtitle="Gerencie congressos e assembleias com múltiplos dias"
        icon={<CalendarDays className="w-5 h-5" />}
        actions={<Button onClick={openCreate} size="sm"><Plus className="w-4 h-4 mr-1" />Novo Evento</Button>}
      />

      {events.length === 0 ? (
        <Card className="p-12 text-center text-stone-500">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum evento cadastrado</p>
          <Button className="mt-4" onClick={openCreate}>Criar primeiro evento</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map(ev => (
            <Card key={ev.id} className={`p-5 ${ev.is_active ? 'ring-2 ring-amber-400' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100 text-lg">{ev.name}</h3>
                    {ev.is_active && <Badge variant="warning">Ativo</Badge>}
                  </div>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {new Date(ev.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} — {new Date(ev.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {ev.days.map(d => (
                      <span key={d.id} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300">
                        {d.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setActive(ev)}
                    title={ev.is_active ? 'Desativar' : 'Ativar como evento atual'}
                    className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    {ev.is_active
                      ? <CheckCircle2 className="w-5 h-5 text-amber-500" />
                      : <Circle className="w-5 h-5 text-stone-400" />}
                  </button>
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
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar Evento' : 'Novo Evento'} size="lg">
        <div className="space-y-4">
          <Input label="Nome do Evento" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Congresso Regional 2026" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data Inicial" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="Data Final" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>

          {previewDates.length > 0 && (
            <div>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Dias do evento</p>
              <div className="space-y-2">
                {previewDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 w-24 flex-shrink-0">
                      {d.toLocaleDateString('pt-BR')}
                    </span>
                    <input
                      type="text"
                      value={getLabel(d)}
                      onChange={e => setLabel(d, e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Excluir Evento"
        message={`Excluir "${deleting?.name}"? Isso removerá todos os dias e desvínculos de veículos.`}
        onConfirm={handleDelete}
      />
    </div>
  )
}
