import { useEffect, useRef, useState } from 'react'
import {
  Anchor, Bus, ChevronLeft, Users, CheckCircle2, XCircle, Clock,
  Search, CalendarDays, AlertTriangle, Plus, Navigation, MapPin,
  UserPlus, Baby, Accessibility,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Vehicle, Congregation, BoardingStatus, VehicleTrip, TripStatus, Passenger, DocumentType } from '../types'
import { SeatMap } from '../components/seating/SeatMap'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/Input'
import { BOARDING_OBSERVATION_OPTIONS, formatDocumentType } from '../lib/utils'
import { playSound } from '../lib/sounds'
import { logAction } from '../lib/audit'
import toast from 'react-hot-toast'

interface BoardingEntry {
  assignmentId: string
  passengerId: string
  seatNumber: number
  passengerName: string
  documentType: string
  documentNumber: string
  isMinor: boolean
  boardingStatus: BoardingStatus
  boardingObservation: string | null
}

interface LapChildEntry {
  id: string
  fullName: string
  documentType: string
  documentNumber: string
  guardianName: string
  guardianSeat: number
}

const TRIP_LABEL: Record<TripStatus, string> = {
  not_started:    'Aguardando',
  boarding:       'Embarcando',
  departed:       'Em Viagem',
  arrived:        'Chegou',
  return_departed:'Retornando',
  return_arrived: 'Retornou',
}

const TRIP_COLOR: Record<TripStatus, string> = {
  not_started:    'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  boarding:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  departed:       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  arrived:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  return_departed:'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  return_arrived: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
}

// Next trip action for each status
const TRIP_NEXT: Partial<Record<TripStatus, { label: string; next: TripStatus; sound: 'trip_start' | 'trip_end' }>> = {
  not_started:    { label: 'Iniciar Embarque',    next: 'boarding',        sound: 'trip_start' },
  boarding:       { label: 'Partir',               next: 'departed',        sound: 'trip_start' },
  departed:       { label: 'Registrar Chegada',    next: 'arrived',         sound: 'trip_end'   },
  arrived:        { label: 'Iniciar Retorno',      next: 'return_departed', sound: 'trip_start' },
  return_departed:{ label: 'Registrar Chegada',    next: 'return_arrived',  sound: 'trip_end'   },
}

export function CaptainPage() {
  const { user, profile, congregationIds } = useAuth()
  const { selectedEvent, eventDays } = useEvent()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [entries, setEntries] = useState<BoardingEntry[]>([])
  const [lapChildren, setLapChildren] = useState<LapChildEntry[]>([])
  const [seats, setSeats] = useState<any[]>([])
  const [totalSeats, setTotalSeats] = useState(0)
  const [trip, setTrip] = useState<VehicleTrip | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | BoardingStatus>('all')
  const [obsModal, setObsModal] = useState<{ entry: BoardingEntry; obs: string } | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [availablePassengers, setAvailablePassengers] = useState<Passenger[]>([])
  const [loadingPassengers, setLoadingPassengers] = useState(false)
  const [newPassengerForm, setNewPassengerForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDoc, setNewDoc] = useState<DocumentType>('cpf')
  const [newDocNum, setNewDocNum] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [myPassengerId, setMyPassengerId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) { setInitialLoading(false); return }
    loadVehicles()
    supabase
      .from('captain_passenger_links')
      .select('passenger_id')
      .eq('captain_id', user.id)
      .maybeSingle()
      .then(({ data }) => setMyPassengerId(data?.passenger_id ?? null))
  }, [selectedEvent, user?.id])

  useEffect(() => {
    if (selectedVehicle) {
      loadBoardingList(selectedVehicle)
      loadTrip(selectedVehicle)
      setSearch('')
      setFilter('all')
    } else {
      setEntries([])
      setLapChildren([])
      setSeats([])
      setTotalSeats(0)
      setTrip(null)
    }
  }, [selectedVehicle])

  async function loadVehicles() {
    setInitialLoading(true)
    setSelectedVehicle(null)

    // Load only vehicles assigned to this captain
    const { data: assignedLinks } = await supabase
      .from('captain_vehicles')
      .select('vehicle_id')
      .eq('captain_id', user!.id)

    const assignedIds = (assignedLinks ?? []).map((l: any) => l.vehicle_id)
    if (assignedIds.length === 0) {
      setVehicles([])
      setCongregations([])
      setInitialLoading(false)
      return
    }

    let vQuery = supabase.from('vehicles').select('*').in('id', assignedIds).order('name')
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    const { data: vData } = await vQuery
    setVehicles(vData ?? [])

    // Load congregations just for grouping display
    const congIds = [...new Set((vData ?? []).map((v: any) => v.congregation_id))]
    if (congIds.length > 0) {
      const { data: congs } = await supabase.from('congregations').select('*').in('id', congIds)
      setCongregations(congs ?? [])
    }
    setInitialLoading(false)
  }

  async function loadBoardingList(vehicleId: string) {
    setLoading(true)
    const vehicle = vehicles.find(v => v.id === vehicleId)

    const { count } = await supabase.from('seats').select('*', { count: 'exact', head: true }).eq('vehicle_id', vehicleId)
    setTotalSeats(count ?? vehicle?.capacity ?? 0)

    // Load seats for seat map
    const { data: seatData } = await supabase.from('seats').select('*').eq('vehicle_id', vehicleId).order('seat_number')
    const { data: assignData } = await supabase.from('seat_assignments').select('*').eq('vehicle_id', vehicleId).eq('status', 'active')

    const { data: passengers } = assignData && assignData.length > 0
      ? await supabase.from('passengers').select('id, full_name, document_type, document_number, is_minor, guardian_id').in('id', assignData.map((a: any) => a.passenger_id))
      : { data: [] }

    const enrichedAssign = (assignData ?? []).map((a: any) => ({
      ...a,
      passenger: (passengers ?? []).find((p: any) => p.id === a.passenger_id) ?? null,
    }))

    const enrichedSeats = (seatData ?? []).map((seat: any) => ({
      ...seat,
      assignment: enrichedAssign.find((a: any) => a.seat_id === seat.id),
    }))
    setSeats(enrichedSeats)

    const list: BoardingEntry[] = (assignData ?? []).map((a: any) => {
      const seat = (seatData ?? []).find((s: any) => s.id === a.seat_id)
      const passenger = (passengers ?? []).find((p: any) => p.id === a.passenger_id)
      return {
        assignmentId: a.id,
        passengerId: a.passenger_id,
        seatNumber: seat?.seat_number ?? 0,
        passengerName: passenger?.full_name ?? '',
        documentType: passenger?.document_type ?? 'cpf',
        documentNumber: passenger?.document_number ?? '',
        isMinor: passenger?.is_minor ?? false,
        boardingStatus: a.boarding_status,
        boardingObservation: a.boarding_observation,
      }
    }).sort((a: BoardingEntry, b: BoardingEntry) => a.seatNumber - b.seatNumber)

    const seen = new Set<string>()
    const deduped = list.filter(e => {
      if (seen.has(e.passengerId)) return false
      seen.add(e.passengerId)
      return true
    })
    setEntries(deduped)

    // Lap children
    const passengerIds = deduped.map(e => e.passengerId)
    const { data: lapData } = passengerIds.length > 0
      ? await supabase.from('passengers').select('id, full_name, document_type, document_number, guardian_id').eq('passenger_type', 'lap_child').in('guardian_id', passengerIds)
      : { data: [] }

    setLapChildren((lapData ?? []).map((child: any) => {
      const guardianEntry = deduped.find(e => e.passengerId === child.guardian_id)
      const guardianPassenger = (passengers ?? []).find((p: any) => p.id === child.guardian_id)
      return {
        id: child.id,
        fullName: child.full_name,
        documentType: child.document_type,
        documentNumber: child.document_number,
        guardianName: guardianPassenger?.full_name ?? '',
        guardianSeat: guardianEntry?.seatNumber ?? 0,
      }
    }))

    setLoading(false)
  }

  async function loadTrip(vehicleId: string) {
    const { data } = await supabase
      .from('vehicle_trips')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setTrip(data ?? null)
  }

  async function updateBoarding(assignmentId: string, status: BoardingStatus, observation?: string) {
    const { error } = await supabase
      .from('seat_assignments')
      .update({ boarding_status: status, boarding_observation: observation ?? null })
      .eq('id', assignmentId)
    if (error) { toast.error('Erro ao atualizar embarque'); return }

    setEntries(prev => prev.map(e =>
      e.assignmentId === assignmentId
        ? { ...e, boardingStatus: status, boardingObservation: observation ?? null }
        : e
    ))

    if (status === 'boarded') {
      playSound('boarding_ok')
      toast.success('Embarcou!')
    } else if (status === 'not_boarded') {
      playSound('boarding_absent')
      toast.success('Marcado como ausente')
    }

    // Notify congregation admins
    await notifyAdmins(
      status === 'boarded' ? 'Embarque confirmado' : 'Passageiro ausente',
      `${entries.find(e => e.assignmentId === assignmentId)?.passengerName ?? 'Passageiro'} — ${status === 'boarded' ? 'embarcou' : 'não embarcou'}`,
    )
  }

  async function advanceTrip() {
    const vehicle = vehicles.find(v => v.id === selectedVehicle)
    if (!vehicle) return
    const currentStatus: TripStatus = trip?.status as TripStatus ?? 'not_started'
    const next = TRIP_NEXT[currentStatus]
    if (!next) return

    const now = new Date().toISOString()
    const update: any = { status: next.next, updated_at: now }
    if (next.next === 'boarding')         update.boarding_started_at = now
    if (next.next === 'departed')         update.departed_at = now
    if (next.next === 'arrived')          update.arrived_at = now
    if (next.next === 'return_departed')  update.return_departed_at = now
    if (next.next === 'return_arrived')   update.return_arrived_at = now

    if (trip) {
      const { data } = await supabase.from('vehicle_trips').update(update).eq('id', trip.id).select().single()
      setTrip(data)
    } else {
      const { data } = await supabase.from('vehicle_trips').insert({
        vehicle_id: vehicle.id,
        event_id: vehicle.event_id,
        congregation_id: vehicle.congregation_id,
        captain_id: user?.id,
        ...update,
      }).select().single()
      setTrip(data)
    }

    playSound(next.sound)
    toast.success(`${next.label} registrado!`)

    await notifyAdmins(
      `Viagem — ${vehicle.name}`,
      `${profile?.full_name ?? 'Capitão'}: ${next.label} em ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    )

    await logAction({
      congregationId: vehicle.congregation_id,
      actionType: 'trip_status_updated',
      description: `${next.label} — ${vehicle.name} (capitão: ${profile?.full_name ?? user?.id})`,
      performedBy: user!.id,
    })
  }

  async function notifyAdmins(title: string, message: string) {
    if (!selectedVehicle) return
    const vehicle = vehicles.find(v => v.id === selectedVehicle)
    if (!vehicle) return

    // Find congregation admins (role admin_congregation)
    const { data: admins } = await supabase
      .from('congregation_admins')
      .select('user_id, profiles:user_id(role)')
      .eq('congregation_id', vehicle.congregation_id)

    const adminIds = (admins ?? [])
      .filter((a: any) => a.profiles?.role === 'admin_congregation' || a.profiles?.role === 'admin_general')
      .map((a: any) => a.user_id)

    if (adminIds.length === 0) return

    await supabase.from('notifications').insert(
      adminIds.map((uid: string) => ({
        user_id: uid,
        title,
        message,
        type: 'info',
        related_vehicle_id: vehicle.id,
        congregation_id: vehicle.congregation_id,
      }))
    )
  }

  // Load available passengers for "add" modal
  async function openAddModal() {
    const vehicle = vehicles.find(v => v.id === selectedVehicle)
    if (!vehicle) return
    setAddModal(true)
    setAddSearch('')
    setNewPassengerForm(false)
    setLoadingPassengers(true)

    const assignedIds = entries.map(e => e.passengerId)
    let pQuery = supabase.from('passengers').select('*').eq('congregation_id', vehicle.congregation_id).order('full_name')
    const { data } = await pQuery
    const available = (data ?? []).filter((p: any) => !assignedIds.includes(p.id))
    setAvailablePassengers(available)
    setLoadingPassengers(false)
  }

  async function addExistingPassenger(passenger: Passenger) {
    const vehicle = vehicles.find(v => v.id === selectedVehicle)
    if (!vehicle) return

    // Find a free seat
    const occupiedSeatIds = new Set(entries.map(e => e.seatNumber))
    const allSeats = seats.filter((s: any) => !s.assignment)
    if (allSeats.length === 0) { toast.error('Sem vagas disponíveis'); return }
    const freeSeat = allSeats[0]

    const { error } = await supabase.from('seat_assignments').insert({
      vehicle_id: vehicle.id,
      seat_id: freeSeat.id,
      passenger_id: passenger.id,
      status: 'active',
      payment_status: 'pending',
      boarding_status: 'pending',
    })

    if (error) {
      toast.error('Erro ao adicionar passageiro')
      return
    }

    playSound('success')
    toast.success(`${passenger.full_name} adicionado ao veículo`)
    setAddModal(false)

    await notifyAdmins(
      'Passageiro adicionado',
      `${profile?.full_name ?? 'Capitão'} adicionou "${passenger.full_name}" ao ${vehicle.name}`,
    )
    await logAction({
      congregationId: vehicle.congregation_id,
      actionType: 'captain_passenger_added',
      description: `Capitão adicionou "${passenger.full_name}" ao veículo ${vehicle.name}`,
      performedBy: user!.id,
    })

    loadBoardingList(vehicle.id)
  }

  async function createAndAddPassenger() {
    const vehicle = vehicles.find(v => v.id === selectedVehicle)
    if (!vehicle) return
    if (!newName.trim() || !newDocNum.trim()) { toast.error('Preencha nome e documento'); return }

    const freeSeat = seats.find((s: any) => !s.assignment)
    if (!freeSeat) { toast.error('Sem vagas disponíveis'); return }

    setSavingNew(true)
    try {
      const { data: newP, error: pErr } = await supabase.from('passengers').insert({
        full_name: newName.trim(),
        document_type: newDoc,
        document_number: newDocNum.trim(),
        passenger_type: 'normal',
        is_minor: false,
        congregation_id: vehicle.congregation_id,
        event_id: vehicle.event_id,
      }).select().single()
      if (pErr) throw pErr

      const { error: aErr } = await supabase.from('seat_assignments').insert({
        vehicle_id: vehicle.id,
        seat_id: freeSeat.id,
        passenger_id: newP.id,
        status: 'active',
        payment_status: 'pending',
        boarding_status: 'pending',
      })
      if (aErr) throw aErr

      playSound('success')
      toast.success(`${newP.full_name} cadastrado e adicionado!`)
      setAddModal(false)
      setNewPassengerForm(false)
      setNewName(''); setNewDocNum('')

      await notifyAdmins(
        'Novo passageiro cadastrado',
        `${profile?.full_name ?? 'Capitão'} cadastrou "${newP.full_name}" e adicionou ao ${vehicle.name}`,
      )
      await logAction({
        congregationId: vehicle.congregation_id,
        actionType: 'captain_passenger_created',
        description: `Capitão criou e adicionou "${newP.full_name}" ao veículo ${vehicle.name}`,
        performedBy: user!.id,
      })

      loadBoardingList(vehicle.id)
    } catch {
      toast.error('Erro ao cadastrar passageiro')
    } finally {
      setSavingNew(false)
    }
  }

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.passengerName.toLowerCase().includes(search.toLowerCase()) || e.documentNumber.includes(search)
    const matchFilter = filter === 'all' || e.boardingStatus === filter
    return matchSearch && matchFilter
  })

  const boarded = entries.filter(e => e.boardingStatus === 'boarded').length
  const absent = entries.filter(e => e.boardingStatus === 'not_boarded').length
  const pending = entries.filter(e => e.boardingStatus === 'pending').length
  const freeSeats = totalSeats - entries.length
  const canAddPassenger = freeSeats > 0 || entries.some(e => e.boardingStatus === 'not_boarded')

  const selectedVehicleObj = vehicles.find(v => v.id === selectedVehicle)
  const vehicleDay = selectedVehicleObj?.event_day_id ? eventDays.find(d => d.id === selectedVehicleObj.event_day_id) : null

  const tripStatus: TripStatus = (trip?.status as TripStatus) ?? 'not_started'
  const nextAction = TRIP_NEXT[tripStatus]

  const filteredPassengers = availablePassengers.filter(p =>
    !addSearch || p.full_name.toLowerCase().includes(addSearch.toLowerCase()) || p.document_number.includes(addSearch)
  )

  if (initialLoading) return (
    <div className="flex items-center justify-center py-24"><Spinner size="lg" label="Carregando..." /></div>
  )

  // ── Vehicle selection ──
  if (!selectedVehicle) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center">
            <Anchor className="w-5 h-5 text-amber-950" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Capitania</h1>
            <p className="text-sm text-stone-400">
              {profile?.full_name ? `Capitão: ${profile.full_name}` : 'Selecione seu veículo'}
            </p>
          </div>
        </div>

        {selectedEvent && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
            <CalendarDays className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{selectedEvent.name}</span>
          </div>
        )}

        {vehicles.length === 0 ? (
          <div className="p-10 bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 text-center">
            <Bus className="w-10 h-10 mx-auto mb-2 text-stone-300" />
            <p className="text-sm text-stone-400">Nenhum veículo atribuído</p>
            <p className="text-xs text-stone-300 mt-1">Aguardando vinculação pelo administrador</p>
          </div>
        ) : (
          <div className="space-y-2">
            {eventDays.length > 0 ? (
              <>
                {eventDays.map(day => {
                  const dayVehicles = vehicles.filter(v => v.event_day_id === day.id)
                  if (dayVehicles.length === 0) return null
                  return (
                    <div key={day.id}>
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1 mb-2">{day.label}</p>
                      <div className="space-y-2">
                        {dayVehicles.map(v => <CaptainVehicleCard key={v.id} v={v} cong={congregations.find(c => c.id === v.congregation_id)} onSelect={() => setSelectedVehicle(v.id)} />)}
                      </div>
                    </div>
                  )
                })}
                {vehicles.filter(v => !v.event_day_id).length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1 mb-2">Todos os dias</p>
                    <div className="space-y-2">
                      {vehicles.filter(v => !v.event_day_id).map(v => <CaptainVehicleCard key={v.id} v={v} cong={congregations.find(c => c.id === v.congregation_id)} onSelect={() => setSelectedVehicle(v.id)} />)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              vehicles.map(v => <CaptainVehicleCard key={v.id} v={v} cong={congregations.find(c => c.id === v.congregation_id)} onSelect={() => setSelectedVehicle(v.id)} />)
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Boarding view ──
  return (
    <div className="animate-fade-in space-y-4" ref={listRef}>

      {/* Header */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedVehicle(null)}
            className="p-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 hover:border-amber-300 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            {selectedEvent && <span className="text-xs text-stone-400 truncate block">{selectedEvent.name}</span>}
            {vehicleDay && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{vehicleDay.label} · </span>}
            <p className="font-bold text-stone-800 dark:text-stone-100 truncate leading-tight">{selectedVehicleObj?.name}</p>
          </div>
          {/* Trip status chip */}
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${TRIP_COLOR[tripStatus]}`}>
            {TRIP_LABEL[tripStatus]}
          </span>
        </div>
      </div>

      {/* Trip controls */}
      {nextAction && (
        <button
          onClick={advanceTrip}
          className="w-full p-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-sm rounded-2xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4" />
          {nextAction.label}
        </button>
      )}
      {tripStatus === 'return_arrived' && (
        <div className="p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-2xl text-center">
          <MapPin className="w-6 h-6 text-teal-600 mx-auto mb-1" />
          <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">Viagem concluída!</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: entries.length, color: 'text-stone-700 dark:text-stone-200', bg: 'bg-white dark:bg-stone-800' },
          { label: 'Embarcaram', value: boarded, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Ausentes', value: absent, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' },
          { label: 'Pendentes', value: pending, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-stone-100 dark:border-stone-700 rounded-2xl p-3 text-center`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-stone-400 leading-tight mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {entries.length > 0 && (
        <div>
          <div className="flex justify-between text-xs text-stone-400 mb-1">
            <span>Progresso do embarque</span>
            <span>{Math.round((boarded / entries.length) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(boarded / entries.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Seat map (read-only) */}
      {seats.length > 0 && (
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">Mapa de Assentos (somente leitura)</p>
          <SeatMap
            seats={seats}
            vehicleType={selectedVehicleObj?.type ?? 'bus'}
            onSeatClick={() => {}}
            selectedSeat={null}
            captainPassengerIds={myPassengerId ? new Set([myPassengerId]) : undefined}
          />
        </div>
      )}

      {/* Add passenger button */}
      {canAddPassenger && (
        <button
          onClick={openAddModal}
          className="w-full p-3.5 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-2xl text-amber-600 dark:text-amber-400 font-medium text-sm flex items-center justify-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          Adicionar Passageiro
          {freeSeats > 0 && <span className="text-xs opacity-70">({freeSeats} vaga{freeSeats !== 1 ? 's' : ''} livre{freeSeats !== 1 ? 's' : ''})</span>}
        </button>
      )}

      {/* Search + filter */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Pesquisar passageiro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {([
            ['all', 'Todos', entries.length],
            ['pending', 'Pendentes', pending],
            ['boarded', 'Embarcaram', boarded],
            ['not_boarded', 'Ausentes', absent],
          ] as const).map(([val, label, cnt]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                filter === val ? 'bg-amber-400 text-amber-950' : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500'
              }`}
            >
              {label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === val ? 'bg-amber-300/50' : 'bg-stone-100 dark:bg-stone-700'}`}>{cnt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Boarding list */}
      {loading ? (
        <Spinner className="py-10" label="Carregando lista..." />
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <div
              key={entry.assignmentId}
              className={`bg-white dark:bg-stone-800 rounded-2xl border p-4 transition-all ${
                entry.boardingStatus === 'boarded'
                  ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-900/10'
                  : entry.boardingStatus === 'not_boarded'
                    ? 'border-rose-200 dark:border-rose-700 bg-rose-50/30 dark:bg-rose-900/10'
                    : 'border-stone-100 dark:border-stone-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Seat number */}
                <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-stone-500 dark:text-stone-400">{entry.seatNumber}</span>
                </div>

                {/* Passenger info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm">{entry.passengerName}</p>
                    {myPassengerId && entry.passengerId === myPassengerId && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        <Anchor className="w-2.5 h-2.5" /> Você
                      </span>
                    )}
                    {entry.isMinor && <Badge variant="warning"><Baby className="w-3 h-3" /></Badge>}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">{formatDocumentType(entry.documentType as any)} · {entry.documentNumber}</p>
                  {entry.boardingObservation && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 italic">{entry.boardingObservation}</p>
                  )}
                </div>

                {/* Status / Action buttons */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {entry.boardingStatus === 'boarded' ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <button
                        onClick={() => updateBoarding(entry.assignmentId, 'pending')}
                        className="w-11 h-11 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center justify-center"
                        title="Desfazer"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  ) : entry.boardingStatus === 'not_boarded' ? (
                    <div className="flex items-center gap-1">
                      <XCircle className="w-5 h-5 text-rose-400" />
                      <button
                        onClick={() => updateBoarding(entry.assignmentId, 'pending')}
                        className="w-11 h-11 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center justify-center"
                        title="Desfazer"
                      >
                        <Clock className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => updateBoarding(entry.assignmentId, 'boarded')}
                        className="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-all active:scale-95"
                        title="Embarcou"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setObsModal({ entry, obs: entry.boardingObservation ?? '' })}
                        className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 hover:bg-rose-200 dark:hover:bg-rose-900/50 text-rose-500 flex items-center justify-center transition-all active:scale-95"
                        title="Ausente / Observação"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-stone-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum passageiro encontrado</p>
            </div>
          )}

          {/* Lap children section */}
          {lapChildren.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-stone-400 uppercase tracking-widest px-1 mb-2">
                Crianças de Colo ({lapChildren.length})
              </p>
              <div className="space-y-2">
                {lapChildren.map(child => (
                  <div key={child.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-3 flex items-center gap-3">
                    <Baby className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{child.fullName}</p>
                      <p className="text-xs text-stone-400">{formatDocumentType(child.documentType as any)} · {child.documentNumber}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Responsável: {child.guardianName} (assento {child.guardianSeat})</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Observation modal */}
      <Modal
        open={!!obsModal}
        onClose={() => setObsModal(null)}
        title="Registrar Ausência / Observação"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setObsModal(null)} className="flex-1">Cancelar</Button>
            <Button
              variant="danger"
              onClick={() => { if (obsModal) { updateBoarding(obsModal.entry.assignmentId, 'not_boarded', obsModal.obs); setObsModal(null) } }}
              className="flex-1"
              icon={<XCircle className="w-4 h-4" />}
            >
              Registrar Ausência
            </Button>
          </div>
        }
      >
        {obsModal && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{obsModal.entry.passengerName}</p>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-stone-500">Motivo (opcional)</label>
              <div className="grid grid-cols-2 gap-1.5">
                {BOARDING_OBSERVATION_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setObsModal(m => m ? { ...m, obs: opt } : null)}
                    className={`px-3 py-2 rounded-xl text-xs text-left transition-all ${
                      obsModal.obs === opt
                        ? 'bg-amber-100 border border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300'
                        : 'bg-stone-50 border border-stone-200 text-stone-500 dark:bg-stone-700 dark:border-stone-600 hover:border-stone-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Ou descreva outro motivo..."
                value={obsModal.obs}
                onChange={e => setObsModal(m => m ? { ...m, obs: e.target.value } : null)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400 mt-1"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Add passenger modal */}
      <Modal
        open={addModal}
        onClose={() => { setAddModal(false); setNewPassengerForm(false) }}
        title="Adicionar Passageiro"
        size="md"
      >
        <div className="flex flex-col gap-3">
          {!newPassengerForm ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input
                  type="search"
                  placeholder="Buscar passageiro da congregação..."
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
              </div>

              {loadingPassengers ? (
                <Spinner className="py-6" label="Buscando..." />
              ) : filteredPassengers.length === 0 ? (
                <div className="text-center py-6 text-stone-400">
                  <p className="text-sm">
                    {addSearch ? 'Nenhum resultado.' : 'Todos os passageiros já estão no veículo.'}
                  </p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredPassengers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addExistingPassenger(p)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-amber-700">{p.full_name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-800 dark:text-stone-100 truncate">{p.full_name}</p>
                        <p className="text-xs text-stone-400">{formatDocumentType(p.document_type)} · {p.document_number}</p>
                      </div>
                      <Plus className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setNewPassengerForm(true)}
                className="w-full p-3 border-2 border-dashed border-stone-200 dark:border-stone-600 rounded-xl text-stone-500 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <UserPlus className="w-4 h-4" />
                Cadastrar novo passageiro
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ Cadastre apenas quem não está na base. Complete os dados básicos.
                </p>
              </div>
              <Input
                label="Nome Completo *"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome do passageiro"
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Tipo de Documento</label>
                <select
                  value={newDoc}
                  onChange={e => setNewDoc(e.target.value as DocumentType)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="cpf">CPF</option>
                  <option value="rg">RG</option>
                  <option value="birth_certificate">Certidão de Nascimento</option>
                </select>
              </div>
              <Input
                label="Número do Documento *"
                value={newDocNum}
                onChange={e => setNewDocNum(e.target.value)}
                placeholder="000.000.000-00"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setNewPassengerForm(false)} className="flex-1">Voltar</Button>
                <Button onClick={createAndAddPassenger} loading={savingNew} className="flex-1">Adicionar</Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ── Vehicle card component ──
function CaptainVehicleCard({ v, cong, onSelect }: { v: Vehicle; cong?: Congregation; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 hover:shadow-md hover:border-amber-200 dark:hover:border-amber-700 active:scale-[0.99] transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bus className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-stone-800 dark:text-stone-100">{v.name}</p>
            {cong && <p className="text-xs text-stone-400 mt-0.5">{cong.name}</p>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-stone-700 dark:text-stone-200">{v.capacity}</p>
          <p className="text-[10px] text-stone-400">lugares</p>
        </div>
      </div>
    </button>
  )
}
