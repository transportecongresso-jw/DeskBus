import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, Plus, Pencil, Trash2, Users, ChevronRight, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Vehicle, Congregation, VehicleType, TransportCompany } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import { HelpIcon } from '../components/ui/Tooltip'
import { formatCurrency, formatVehicleType } from '../lib/utils'
import toast from 'react-hot-toast'

interface VehicleWithStats extends Vehicle {
  occupied: number
  congregation?: Congregation
}

const CAPACITY_OPTIONS = {
  bus: [40, 42, 44, 46, 48, 50, 52, 54],
  van: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  microbus: [28, 30, 32],
}

// Returns row/column for a seat number given the vehicle type layout.
// Van uses 2+1 (3 cols per row); bus/microbus use 2+2 (4 cols per row).
function seatPosition(seatNum: number, vehicleType: VehicleType) {
  const cols = vehicleType === 'van' ? 3 : 4
  return {
    row_number: Math.ceil(seatNum / cols),
    column_position: ((seatNum - 1) % cols) + 1,
  }
}

export function VehiclesPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const { selectedEvent, eventDays } = useEvent()
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState<VehicleWithStats[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [companies, setCompanies] = useState<TransportCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [deleting, setDeleting] = useState<Vehicle | null>(null)
  const [selectedDayId, setSelectedDayId] = useState<string>('all')

  useEffect(() => {
    if (!isAdminGeneral && congregationIds.length === 0) { setLoading(false); return }
    loadData()
  }, [selectedEvent, congregationIds, isAdminGeneral])

  async function loadData() {
    setLoading(true)
    let cQuery = supabase.from('congregations').select('*').order('name')
    if (!isAdminGeneral) cQuery = cQuery.in('id', congregationIds)
    const [{ data: congs }, { data: comps }] = await Promise.all([
      cQuery, supabase.from('transport_companies').select('*').order('name'),
    ])
    setCongregations(congs ?? [])
    setCompanies(comps ?? [])

    const congIds = (congs ?? []).map(c => c.id)

    let vQuery = supabase.from('vehicles').select('*').order('name')
    if (congIds.length > 0) vQuery = vQuery.in('congregation_id', congIds)
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    const { data: vData } = await vQuery
    if (!vData) { setLoading(false); return }

    const { data: assignments } = vData.length > 0
      ? await supabase.from('seat_assignments').select('vehicle_id').eq('status', 'active').in('vehicle_id', vData.map(v => v.id))
      : { data: [] }

    const withStats: VehicleWithStats[] = vData.map(v => ({
      ...v,
      occupied: assignments?.filter(a => a.vehicle_id === v.id).length ?? 0,
      congregation: congs?.find(c => c.id === v.congregation_id),
    }))

    setVehicles(withStats)
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('vehicles').delete().eq('id', deleting.id)
    if (error) {
      toast.error('Erro ao excluir veículo')
    } else {
      toast.success('Veículo excluído')
      setDeleting(null)
      loadData()
    }
  }

  const filteredVehicles = selectedDayId === 'all'
    ? vehicles
    : selectedDayId === 'none'
      ? vehicles.filter(v => !v.event_day_id)
      : vehicles.filter(v => v.event_day_id === selectedDayId)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Veículos"
        subtitle={selectedEvent ? `${selectedEvent.name}` : 'Gerencie os veículos e sua ocupação'}
        icon={<Bus className="w-6 h-6" />}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
            Novo Veículo
          </Button>
        }
      />

      {/* Day tabs when there's an active event */}
      {selectedEvent && eventDays.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedDayId('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedDayId === 'all'
                ? 'bg-amber-400 text-amber-950'
                : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:border-amber-300'
            }`}
          >
            Todos os dias
          </button>
          {eventDays.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDayId(d.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                selectedDayId === d.id
                  ? 'bg-amber-400 text-amber-950'
                  : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 hover:border-amber-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner className="py-20" label="Carregando veículos..." />
      ) : filteredVehicles.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Bus className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-medium text-stone-600 dark:text-stone-300 mb-1">Nenhum veículo cadastrado</h3>
            <p className="text-sm text-stone-400 mb-4">
              {selectedDayId !== 'all' ? 'Nenhum veículo para este dia' : 'Comece adicionando o primeiro veículo'}
            </p>
            <Button onClick={() => setShowForm(true)} icon={<Plus className="w-4 h-4" />}>
              Adicionar Veículo
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredVehicles.map(v => {
            const pct = Math.min(100, Math.round((v.occupied / v.capacity) * 100))
            const isFull = v.occupied >= v.capacity
            const excess = v.occupied > v.capacity ? v.occupied - v.capacity : 0
            const dayLabel = eventDays.find(d => d.id === v.event_day_id)?.label

            return (
              <Card key={v.id} padding="none" className="overflow-hidden group hover:shadow-md transition-shadow">
                <div className={`h-1.5 w-full ${isFull ? 'bg-emerald-400' : excess > 0 ? 'bg-rose-400' : 'bg-amber-300'}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-stone-800 dark:text-stone-100 text-base">{v.name}</h3>
                      {v.congregation && (
                        <p className="text-xs text-stone-400 mt-0.5">{v.congregation.name}</p>
                      )}
                      {dayLabel && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full mt-1">
                          <CalendarDays className="w-3 h-3" />{dayLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={v.type === 'bus' ? 'info' : v.type === 'microbus' ? 'neutral' : 'warning'}>
                        {formatVehicleType(v.type)}
                      </Badge>
                      {v.wheelchair_accessible && (
                        <Badge variant="success">♿ Acessível</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center p-2 bg-stone-50 dark:bg-stone-700 rounded-lg">
                      <p className="text-lg font-bold text-stone-700 dark:text-stone-200">{v.capacity}</p>
                      <p className="text-[10px] text-stone-400">Lugares</p>
                    </div>
                    <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-lg font-bold text-amber-600">{v.occupied}</p>
                      <p className="text-[10px] text-stone-400">Ocupados</p>
                    </div>
                    <div className={`text-center p-2 rounded-lg ${isFull ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-stone-50 dark:bg-stone-700'}`}>
                      <p className={`text-lg font-bold ${isFull ? 'text-emerald-600' : 'text-stone-600 dark:text-stone-300'}`}>
                        {Math.max(0, v.capacity - v.occupied)}
                      </p>
                      <p className="text-[10px] text-stone-400">Livres</p>
                    </div>
                  </div>

                  {excess > 0 && (
                    <div className="mb-3 px-3 py-1.5 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-xs text-rose-600 text-center">
                      ⚠️ {excess} passageiro{excess > 1 ? 's' : ''} excedente{excess > 1 ? 's' : ''}
                    </div>
                  )}

                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                      <span>Ocupação</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isFull ? 'bg-emerald-500' : pct > 80 ? 'bg-amber-400' : 'bg-amber-300'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-400 mb-4">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      Passagem: {formatCurrency(v.ticket_price)}
                    </span>
                    {v.exported_at && <Badge variant="success" dot>Lista exportada</Badge>}
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-stone-100 dark:border-stone-700">
                    <Button variant="primary" size="sm" className="flex-1" icon={<ChevronRight className="w-4 h-4" />}
                      onClick={() => navigate(`/vehicles/${v.id}`)}>
                      Gerenciar
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />}
                      onClick={() => { setEditing(v); setShowForm(true) }} />
                    <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4" />}
                      className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      onClick={() => setDeleting(v)} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <VehicleForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        congregations={congregations}
        companies={companies}
        onSaved={() => { setShowForm(false); loadData() }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Excluir Veículo"
        message={`Excluir "${deleting?.name}"? Todos os assentos e distribuições serão removidos permanentemente.`}
      />
    </div>
  )
}

// --- VehicleForm ---
function VehicleForm({ open, onClose, editing, congregations, companies, onSaved }: {
  open: boolean; onClose: () => void; editing: Vehicle | null;
  congregations: Congregation[]; companies: TransportCompany[]; onSaved: () => void
}) {
  const { isAdminGeneral, congregationIds } = useAuth()
  const { events, selectedEvent, eventDays } = useEvent()
  const [type, setType] = useState<VehicleType>('bus')
  const [capacity, setCapacity] = useState(46)
  const [name, setName] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [ticketPrice, setTicketPrice] = useState(0)
  const [eventId, setEventId] = useState<string>('')
  const [eventDayId, setEventDayId] = useState<string>('')
  const [transportCompanyId, setTransportCompanyId] = useState<string>('')
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false)
  const [loading, setLoading] = useState(false)

  const selectedEvents = events.filter(e => e.status === 'active')
  const daysForEvent = eventDays.filter(d => d.event_id === eventId)

  useEffect(() => {
    if (editing) {
      setType(editing.type)
      setCapacity(editing.capacity)
      setName(editing.name)
      setCongregationId(editing.congregation_id)
      setTicketPrice(editing.ticket_price)
      setEventId(editing.event_id ?? selectedEvent?.id ?? '')
      setEventDayId(editing.event_day_id ?? '')
      setTransportCompanyId((editing as any).transport_company_id ?? '')
      setWheelchairAccessible(editing.wheelchair_accessible ?? false)
    } else {
      setType('bus')
      setCapacity(46)
      setName('')
      setCongregationId(isAdminGeneral ? '' : congregationIds[0] ?? '')
      setTicketPrice(0)
      setEventId(selectedEvent?.id ?? '')
      setEventDayId('')
      setTransportCompanyId('')
      setWheelchairAccessible(false)
    }
  }, [editing, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (!eventId) { toast.error('Selecione o evento'); setLoading(false); return }
      const payload: any = {
        type, capacity, name, congregation_id: congregationId,
        ticket_price: ticketPrice,
        event_id: eventId,
        event_day_id: eventDayId || null,
        transport_company_id: transportCompanyId || null,
        wheelchair_accessible: wheelchairAccessible,
      }
      if (editing) {
        const oldCapacity = editing.capacity
        const newCapacity = capacity

        if (newCapacity < oldCapacity) {
          // Busca assentos que seriam removidos (seat_number > nova capacidade)
          const { data: excessSeats } = await supabase
            .from('seats')
            .select('id, seat_number')
            .eq('vehicle_id', editing.id)
            .gt('seat_number', newCapacity)

          if (excessSeats && excessSeats.length > 0) {
            // Verifica se algum desses assentos tem reserva ativa
            const { data: blocked } = await supabase
              .from('seat_assignments')
              .select('id')
              .in('seat_id', excessSeats.map(s => s.id))
              .eq('status', 'active')

            if (blocked && blocked.length > 0) {
              toast.error(
                `Não é possível reduzir para ${newCapacity} lugares: ${blocked.length} passageiro${blocked.length > 1 ? 's estão' : ' está'} nos assentos que seriam removidos. Remova-os do veículo primeiro.`
              )
              setLoading(false)
              return
            }

            // Nenhuma reserva ativa nos assentos excedentes — remove-os
            await supabase.from('seats').delete().in('id', excessSeats.map(s => s.id))
          }
        } else if (newCapacity > oldCapacity) {
          // Descobre o maior seat_number atual para continuar a numeração
          const { data: existingSeats } = await supabase
            .from('seats')
            .select('seat_number')
            .eq('vehicle_id', editing.id)
            .order('seat_number', { ascending: false })
            .limit(1)

          const currentMax = existingSeats?.[0]?.seat_number ?? 0
          if (currentMax < newCapacity) {
            const newSeats = Array.from({ length: newCapacity - currentMax }, (_, i) => {
              const seatNum = currentMax + i + 1
              return {
                vehicle_id: editing.id,
                seat_number: seatNum,
                ...seatPosition(seatNum, type),
                is_driver: false,
              }
            })
            await supabase.from('seats').insert(newSeats)
          }
        }

        const { error } = await supabase.from('vehicles').update(payload).eq('id', editing.id)
        if (error) throw error
        toast.success('Veículo atualizado')
      } else {
        const { data: vehicle, error } = await supabase.from('vehicles')
          .insert({ ...payload, export_count: 0 }).select().single()
        if (error) throw error
        const seats = Array.from({ length: capacity }, (_, i) => ({
          vehicle_id: vehicle.id,
          seat_number: i + 1,
          ...seatPosition(i + 1, type),
          is_driver: false,
        }))
        await supabase.from('seats').insert(seats)
        toast.success('Veículo criado com mapa de assentos!')
      }
      onSaved()
    } catch {
      toast.error('Erro ao salvar veículo')
    } finally {
      setLoading(false)
    }
  }

  const capacities = CAPACITY_OPTIONS[type]

  const formFooter = (
    <div className="flex gap-3">
      <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button form="vehicle-form" type="submit" loading={loading} className="flex-1">
        {editing ? 'Salvar' : 'Criar Veículo'}
      </Button>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Veículo' : 'Novo Veículo'} size="md" footer={formFooter}>
      <form id="vehicle-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isAdminGeneral && (
          <Select
            label="Congregação"
            value={congregationId}
            onChange={e => setCongregationId(e.target.value)}
            options={congregations.map(c => ({ value: c.id, label: c.name }))}
            placeholder="Selecione a congregação..."
            required
          />
        )}

        <Select
          label="Evento *"
          value={eventId}
          onChange={e => { setEventId(e.target.value); setEventDayId('') }}
          options={[
            { value: '', label: 'Selecione o evento...' },
            ...selectedEvents.map(e => ({ value: e.id, label: e.name })),
          ]}
          required
        />

        {eventId && daysForEvent.length > 0 && (
          <Select
            label="Dia do Evento"
            value={eventDayId}
            onChange={e => setEventDayId(e.target.value)}
            options={[
              { value: '', label: 'Sem dia específico' },
              ...daysForEvent.map(d => ({ value: d.id, label: d.label })),
            ]}
          />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Tipo de Veículo <span className="text-rose-500">*</span></label>
            <HelpIcon content="Ônibus (40–54 lugares, layout 2+2), Micro-ônibus (28–32 lugares, layout 2+2) ou Van (9–20 lugares, layout 2+1)." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(['bus', 'microbus', 'van'] as VehicleType[]).map(t => (
              <button key={t} type="button"
                onClick={() => { setType(t); setCapacity(CAPACITY_OPTIONS[t][0]) }}
                className={`p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                  type === t ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-stone-200 dark:border-stone-600 hover:border-amber-200'
                }`}>
                <Bus className={`w-6 h-6 mx-auto mb-1 ${type === t ? 'text-amber-500' : 'text-stone-400'}`} />
                <p className={`text-xs font-medium ${type === t ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500'}`}>
                  {formatVehicleType(t)}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Capacidade <span className="text-rose-500">*</span></label>
          <div className={`grid gap-2 ${type === 'van' ? 'grid-cols-6' : 'grid-cols-4'}`}>
            {capacities.map(cap => (
              <button key={cap} type="button" onClick={() => setCapacity(cap)}
                className={`py-2 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer ${
                  capacity === cap
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                    : 'border-stone-200 dark:border-stone-600 text-stone-500 hover:border-amber-200'
                }`}>
                {cap}
              </button>
            ))}
          </div>
        </div>

        <Input label="Nome do Veículo" value={name} onChange={e => setName(e.target.value)}
          placeholder={`Ex: ${type === 'bus' ? 'Ônibus 1' : 'Van A'}`} required />

        <Input label="Valor da Passagem (R$)" type="number" min="0" step="0.01"
          value={ticketPrice} onChange={e => setTicketPrice(parseFloat(e.target.value) || 0)} placeholder="0,00" />

        {/* Acessibilidade para cadeirantes */}
        <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
          <input
            type="checkbox"
            id="wheelchair-accessible"
            checked={wheelchairAccessible}
            onChange={e => setWheelchairAccessible(e.target.checked)}
            className="w-4 h-4 accent-amber-400"
          />
          <label htmlFor="wheelchair-accessible" className="text-sm font-medium text-stone-700 dark:text-stone-200 cursor-pointer flex-1">
            ♿ Veículo adaptado para cadeirantes
          </label>
          <HelpIcon content="Marque quando o veículo possui adaptação que permite o embarque de passageiros cadeirantes." />
        </div>

        {companies.length > 0 && (
          <Select
            label="Empresa de Transporte (opcional)"
            value={transportCompanyId}
            onChange={e => setTransportCompanyId(e.target.value)}
            options={[
              { value: '', label: 'Nenhuma empresa vinculada' },
              ...companies.map(c => ({ value: c.id, label: c.name })),
            ]}
          />
        )}

        {!editing && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            ✨ O sistema irá gerar automaticamente {capacity} assentos numerados.
          </div>
        )}

      </form>
    </Modal>
  )
}
