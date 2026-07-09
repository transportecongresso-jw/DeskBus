import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Bus, Users, DollarSign, Download, ArrowLeft, AlertTriangle,
  User, X, RefreshCw, CheckCircle2, Clock, FileSpreadsheet, FileText, Lock, Anchor
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Vehicle, SeatWithAssignment, Passenger, PaymentStatus, Congregation } from '../types'
import { logAction } from '../lib/audit'
import { SeatMap } from '../components/seating/SeatMap'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { StatCard } from '../components/ui/StatCard'
import { Spinner } from '../components/ui/Spinner'
import { HelpIcon } from '../components/ui/Tooltip'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { formatCurrency, formatDocumentType, formatVehicleType } from '../lib/utils'
import { exportToExcel, exportToPDF } from '../lib/export'
import toast from 'react-hot-toast'

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [congregation, setCongregation] = useState<Congregation | null>(null)
  const [seats, setSeats] = useState<SeatWithAssignment[]>([])
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeat, setSelectedSeat] = useState<SeatWithAssignment | null>(null)
  const [showSeatModal, setShowSeatModal] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [substitutingFor, setSubstitutingFor] = useState<SeatWithAssignment | null>(null)
  const [postCloseWarning, setPostCloseWarning] = useState(false)
  const [pendingChange, setPendingChange] = useState<(() => Promise<void>) | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [captainPassengerIds, setCaptainPassengerIds] = useState<Set<string>>(new Set())

  const [moveConflict, setMoveConflict] = useState<{
    passengerId: string
    passengerName: string
    oldSeatNumber: number
    oldAssignmentId: string
    oldPaymentStatus: string
  } | null>(null)

  useEffect(() => {
    if (id) loadVehicle(id)
  }, [id])

  async function loadVehicle(vehicleId: string) {
    setLoading(true)
    const { data: v } = await supabase.from('vehicles').select('*').eq('id', vehicleId).single()
    if (!v) { navigate('/vehicles'); return }
    setVehicle(v)

    const { data: cong } = await supabase.from('congregations').select('*').eq('id', v.congregation_id).single()
    setCongregation(cong)

    // Load captain passenger links for this congregation
    const { data: captainLinks } = await supabase
      .from('captain_passenger_links')
      .select('passenger_id')
      .eq('congregation_id', v.congregation_id)
    setCaptainPassengerIds(new Set((captainLinks ?? []).map((l: any) => l.passenger_id)))

    // Load seats
    const { data: seatData, error: seatError } = await supabase
      .from('seats')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('seat_number')
    if (seatError) console.error('[DeskBus] seats error:', seatError)

    // Load seat assignments WITHOUT embedded join (avoids PostgREST RLS join issue)
    const { data: assignData, error: assignError } = await supabase
      .from('seat_assignments')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active')
    if (assignError) console.error('[DeskBus] seat_assignments error:', assignError)

    // Load all congregation passengers (include guardian for minors/lap-children display)
    const { data: pData, error: pError } = await supabase
      .from('passengers')
      .select('*, guardian:guardian_id(*)')
      .eq('congregation_id', v.congregation_id)
      .order('full_name')
    if (pError) console.error('[DeskBus] passengers error:', pError)

    const allPassengers = pData ?? []

    // IDs já alocados neste veículo
    const assignedIds = (assignData ?? []).map(a => a.passenger_id)

    // Passageiros elegíveis pelo dia do veículo:
    // Se o veículo tem um dia específico, só aparecem passageiros cadastrados para esse dia.
    // Se o veículo não tem dia (event_day_id = null), todos são elegíveis.
    let dayEligibleIds: Set<string> | null = null
    if (v.event_day_id) {
      const { data: dayLinks } = await supabase
        .from('passenger_event_days')
        .select('passenger_id')
        .eq('event_day_id', v.event_day_id)
      dayEligibleIds = new Set((dayLinks ?? []).map((d: any) => d.passenger_id))
    }

    // IDs alocados em OUTROS veículos do mesmo dia (regra: 1 veículo por dia)
    let sameDayAssignedIds: string[] = []
    if (v.event_day_id) {
      const { data: sameDayVehicles } = await supabase
        .from('vehicles')
        .select('id')
        .eq('event_day_id', v.event_day_id)
        .neq('id', vehicleId)
      if (sameDayVehicles && sameDayVehicles.length > 0) {
        const { data: sameDayAssigns } = await supabase
          .from('seat_assignments')
          .select('passenger_id')
          .in('vehicle_id', sameDayVehicles.map(sv => sv.id))
          .eq('status', 'active')
        sameDayAssignedIds = (sameDayAssigns ?? []).map(a => a.passenger_id)
      }
    }

    // Enrich assignments with passenger data manually
    const assignDataEnriched = (assignData ?? []).map(a => ({
      ...a,
      passenger: allPassengers.find(p => p.id === a.passenger_id) ?? null,
    }))

    const enriched: SeatWithAssignment[] = (seatData ?? []).map(seat => ({
      ...seat,
      assignment: assignDataEnriched.find(a => a.seat_id === seat.id) as any ?? undefined,
    }))
    setSeats(enriched)

    // Excluir passageiros já alocados neste veículo OU em outro veículo do mesmo dia.
    // Aplicar também o filtro de compatibilidade de dia.
    const allExcludedIds = new Set([...assignedIds, ...sameDayAssignedIds])
    const eligibleByDay = dayEligibleIds
      ? allPassengers.filter(p => dayEligibleIds!.has(p.id))
      : allPassengers
    setPassengers(eligibleByDay.filter(p => !allExcludedIds.has(p.id)))

    setLoading(false)
  }

  function handleSeatClick(seat: SeatWithAssignment) {
    setSelectedSeat(seat)
    setShowSeatModal(true)
  }

  async function executeChange(action: () => Promise<void>) {
    const isClosed = congregation?.list_status === 'finalized'
    if (isClosed && (vehicle?.post_close_changes ?? 0) >= 3) {
      // 4th+ change after closing: require explicit confirmation
      setPendingChange(() => action)
      setPostCloseWarning(true)
    } else {
      // Lista aberta, exportada ou fechada com < 3 alterações: permite direto
      await action()
    }
  }

  async function assignPassenger(passengerId: string) {
    if (!selectedSeat || !vehicle) return

    // Regra: cadeirante só pode ser vinculado a veículo acessível
    const passenger = passengers.find(p => p.id === passengerId)
    if (passenger?.is_wheelchair_user && !vehicle.wheelchair_accessible) {
      toast.error('Este passageiro é cadeirante e só pode ser vinculado a veículos adaptados para cadeirantes.')
      return
    }

    // Verificar se o passageiro já tem assento ativo neste veículo
    const existingAssignment = seats
      .filter(s => s.id !== selectedSeat.id)
      .find(s => s.assignment?.passenger_id === passengerId && s.assignment?.status === 'active')

    if (existingAssignment) {
      const passengerName = existingAssignment.assignment!.passenger?.full_name ?? 'Passageiro'
      setShowSeatModal(false)
      setMoveConflict({
        passengerId,
        passengerName,
        oldSeatNumber: existingAssignment.seat_number,
        oldAssignmentId: existingAssignment.assignment!.id,
        oldPaymentStatus: existingAssignment.assignment!.payment_status,
      })
      return
    }

    await executeChange(async () => {
      const { error } = await supabase.from('seat_assignments').insert({
        seat_id: selectedSeat.id,
        passenger_id: passengerId,
        vehicle_id: vehicle.id,
        status: 'active',
        payment_status: 'pending',
        boarding_status: 'pending',
      })
      if (error) {
        const msg = error.message?.includes('já está vinculado')
          ? error.message
          : 'Erro ao atribuir passageiro'
        toast.error(msg)
        return
      }
      await logAudit(`Passageiro atribuído ao assento ${selectedSeat.seat_number}`)
      toast.success('Passageiro atribuído!')
      setShowSeatModal(false)
      loadVehicle(vehicle.id)
    })
  }

  async function confirmMovePassenger() {
    if (!moveConflict || !selectedSeat || !vehicle) return
    await executeChange(async () => {
      // Cancelar atribuição antiga — deve ocorrer antes do insert
      const { error: cancelError } = await supabase.from('seat_assignments').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: `Transferido para assento ${selectedSeat.seat_number}`,
      }).eq('id', moveConflict.oldAssignmentId)
      if (cancelError) { toast.error('Erro ao liberar assento anterior'); return }

      // Criar nova atribuição mantendo status de pagamento
      const { error } = await supabase.from('seat_assignments').insert({
        seat_id: selectedSeat.id,
        passenger_id: moveConflict.passengerId,
        vehicle_id: vehicle.id,
        status: 'active',
        payment_status: moveConflict.oldPaymentStatus,
        boarding_status: 'pending',
      })
      if (error) { toast.error('Erro ao mover passageiro'); return }
      await logAudit(`${moveConflict.passengerName} transferido do assento ${moveConflict.oldSeatNumber} para ${selectedSeat.seat_number}`)
      toast.success(`${moveConflict.passengerName} movido para assento ${selectedSeat.seat_number}`)
      setMoveConflict(null)
      loadVehicle(vehicle.id)
    })
  }

  async function removePassenger(reason?: string) {
    if (!selectedSeat?.assignment || !vehicle) return
    await executeChange(async () => {
      const passengerName = selectedSeat.assignment!.passenger?.full_name ?? ''
      const { error } = await supabase
        .from('seat_assignments')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Removido pelo administrador',
        })
        .eq('id', selectedSeat.assignment!.id)
      if (error) { toast.error('Erro ao registrar desistência'); return }
      const isDesistencia = reason && reason !== 'Removido pelo administrador'
      await logAction({
        congregationId: vehicle.congregation_id,
        vehicleId: vehicle.id,
        actionType: isDesistencia ? 'cancellation' : 'seat_removed',
        description: isDesistencia
          ? `Desistência de "${passengerName}" no assento ${selectedSeat.seat_number}. Motivo: ${reason}`
          : `"${passengerName}" removido do assento ${selectedSeat.seat_number}`,
        performedBy: user!.id,
      })
      toast.success(isDesistencia ? 'Desistência registrada' : 'Passageiro removido')
      setShowSeatModal(false)
      setShowCancelModal(false)
      setCancelReason('')
      loadVehicle(vehicle.id)
    })
  }

  async function substitutePassenger(newPassengerId: string) {
    if (!substitutingFor?.assignment || !vehicle) return

    // Regra: cadeirante só pode ser vinculado a veículo acessível
    const newP = passengers.find(p => p.id === newPassengerId)
    if (newP?.is_wheelchair_user && !vehicle.wheelchair_accessible) {
      toast.error('Este passageiro é cadeirante e só pode ser vinculado a veículos adaptados para cadeirantes.')
      return
    }

    await executeChange(async () => {
      const oldName = substitutingFor.assignment!.passenger?.full_name ?? ''

      // Cancel current assignment — deve ocorrer antes do insert
      const { error: cancelError } = await supabase.from('seat_assignments').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: `Substituído por ${newP?.full_name}`,
      }).eq('id', substitutingFor.assignment!.id)
      if (cancelError) { toast.error('Erro ao cancelar atribuição anterior'); return }

      // Create new assignment with substitution reference
      const { error } = await supabase.from('seat_assignments').insert({
        seat_id: substitutingFor.id,
        passenger_id: newPassengerId,
        vehicle_id: vehicle.id,
        status: 'active',
        payment_status: 'pending',
        boarding_status: 'pending',
        substituted_from: substitutingFor.assignment!.passenger_id,
        substitution_reason: `Substituiu ${oldName}`,
      })
      if (error) {
        const msg = error.message?.includes('já está vinculado')
          ? error.message
          : 'Erro ao realizar substituição'
        toast.error(msg)
        return
      }

      await logAction({
        congregationId: vehicle.congregation_id,
        vehicleId: vehicle.id,
        actionType: 'seat_substituted',
        description: `Substituição no assento ${substitutingFor.seat_number}: "${oldName}" → "${newP?.full_name}"`,
        performedBy: user!.id,
      })
      toast.success('Substituição realizada com sucesso!')
      setSubstitutingFor(null)
      setShowSeatModal(false)
      loadVehicle(vehicle.id)
    })
  }

  async function updatePayment(assignmentId: string, status: PaymentStatus) {
    if (!vehicle) return
    const seat = seats.find(s => s.assignment?.id === assignmentId)
    const passengerName = seat?.assignment?.passenger?.full_name ?? ''
    const { error } = await supabase
      .from('seat_assignments')
      .update({ payment_status: status })
      .eq('id', assignmentId)
    if (!error) {
      await logAction({
        congregationId: vehicle.congregation_id,
        vehicleId: vehicle.id,
        actionType: status === 'paid' ? 'payment_paid' : 'payment_pending',
        description: `Pagamento de "${passengerName}" marcado como ${status === 'paid' ? 'pago' : 'pendente'}`,
        performedBy: user!.id,
      })
      toast.success(status === 'paid' ? 'Marcado como pago!' : 'Marcado como pendente')
      loadVehicle(vehicle.id)
    }
  }

  async function logAudit(description: string) {
    if (!vehicle || !user) return
    await logAction({
      congregationId: vehicle.congregation_id,
      vehicleId: vehicle.id,
      actionType: 'seat_assigned',
      description,
      performedBy: user.id,
    })
    // Incrementar contador apenas quando lista estiver fechada
    if (congregation?.list_status === 'finalized') {
      await supabase.from('vehicles')
        .update({ post_close_changes: (vehicle.post_close_changes ?? 0) + 1 })
        .eq('id', vehicle.id)
    }
  }

  async function handleFinalizeList() {
    if (!congregation) return
    setFinalizing(true)
    const { error } = await supabase
      .from('congregations')
      .update({ list_status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: user?.id })
      .eq('id', congregation.id)
    setFinalizing(false)
    if (error) { toast.error('Erro ao finalizar lista'); return }
    setCongregation(prev => prev ? { ...prev, list_status: 'finalized', finalized_at: new Date().toISOString() } : prev)
    setShowFinalizeModal(false)
    toast.success('Lista finalizada com sucesso!')
  }

  async function handleExport(type: 'excel' | 'pdf') {
    if (!vehicle) return
    try {
      const activeAssignments = seats.filter(s => s.assignment).map(s => s.assignment!)
      if (type === 'excel') {
        await exportToExcel(vehicle, activeAssignments as any)
      } else {
        await exportToPDF(vehicle, seats)
      }
      // Registrar exportação (sem bloquear nem zerar contadores)
      await supabase.from('vehicles').update({ exported_at: new Date().toISOString() }).eq('id', vehicle.id)
      await supabase.from('export_records').insert({
        vehicle_id: vehicle.id,
        congregation_id: vehicle.congregation_id,
        export_type: type,
        exported_by: user!.id,
      })
      toast.success('Lista exportada com sucesso!')
      loadVehicle(vehicle.id)
    } catch (err) {
      toast.error('Erro ao exportar lista')
      console.error(err)
    }
    setShowExportMenu(false)
  }

  // Stats
  const occupied = seats.filter(s => s.assignment).length
  const available = Math.max(0, (vehicle?.capacity ?? 0) - occupied)
  const paid = seats.filter(s => s.assignment?.payment_status === 'paid').length
  const pending = seats.filter(s => s.assignment?.payment_status === 'pending').length
  const ticketPrice = vehicle?.ticket_price ?? 0
  const collected = paid * ticketPrice
  const expected = occupied * ticketPrice

  if (loading || !vehicle) return (
    <div className="flex items-center justify-center py-20"><Spinner size="lg" label="Carregando veículo..." /></div>
  )

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(`/congregations/${vehicle.congregation_id}`)}>
          Congregação
        </Button>
        <span className="text-stone-300">/</span>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">{vehicle.name}</h1>
        <Badge variant="info">{formatVehicleType(vehicle.type)} · {vehicle.capacity} lugares</Badge>
        {vehicle.wheelchair_accessible && (
          <Badge variant="success">♿ Acessível</Badge>
        )}
        {vehicle.exported_at && (
          <Badge variant="info" dot>Lista exportada</Badge>
        )}
        {congregation?.list_status === 'finalized' && (vehicle.post_close_changes ?? 0) > 0 && (
          <Badge variant="warning" dot>
            {vehicle.post_close_changes} alteraç{vehicle.post_close_changes === 1 ? 'ão' : 'ões'} após fechamento
          </Badge>
        )}
      </div>

      {/* Finalized warning banner */}
      {congregation?.list_status === 'finalized' ? (
        <div className="mb-5 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-2xl flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Lista Fechada</p>
            <p className="text-xs text-amber-600/80 mt-0.5">
              Esta lista já foi finalizada e enviada para a transportadora. Alterações são permitidas, mas ficam registradas na auditoria e podem causar divergência.
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowFinalizeModal(true)}
          className="w-full mb-5 p-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-bold text-sm rounded-2xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Lock className="w-4 h-4" />
          Fechar Lista de Passageiros
        </button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Lugares" value={vehicle.capacity} color="stone" help="Capacidade total do veículo" />
        <StatCard label="Ocupados" value={occupied} color="amber" help="Passageiros com assento reservado" />
        <StatCard label="Livres" value={available} color={available === 0 ? 'emerald' : 'stone'} help="Assentos disponíveis" />
        <StatCard label="Pagos" value={paid} color="emerald" help="Passageiros com pagamento confirmado" icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatCard label="Pendentes" value={pending} color="rose" help="Passageiros ainda sem pagamento" icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Arrecadado" value={formatCurrency(collected)} color="emerald" sub={`de ${formatCurrency(expected)}`} help="Valor já recebido" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Seat map */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Mapa de Assentos</CardTitle>
                <HelpIcon content="Clique em qualquer assento para gerenciá-lo. Verde = pago, vermelho = pendente, cinza = livre." />
              </div>
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Download className="w-4 h-4" />}
                  onClick={() => setShowExportMenu(v => !v)}
                >
                  Exportar Lista
                </Button>
                {showExportMenu && (
                  <div className="absolute right-0 top-10 bg-white dark:bg-stone-800 rounded-xl shadow-xl border border-stone-100 dark:border-stone-700 py-2 z-20 min-w-48 animate-fade-in">
                    <button
                      onClick={() => handleExport('excel')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      Exportar Excel
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-rose-500" />
                      Exportar PDF
                    </button>
                    <button
                      onClick={() => setShowExportMenu(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <SeatMap
            seats={seats}
            vehicleType={vehicle.type}
            onSeatClick={handleSeatClick}
            selectedSeat={selectedSeat?.id}
            captainPassengerIds={captainPassengerIds}
          />
        </Card>

        {/* Passenger list */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Passageiros</CardTitle>
              <HelpIcon content="Lista de todos os passageiros neste veículo. Clique em Pago/Pendente para alterar o status de pagamento rapidamente." />
            </div>
          </CardHeader>
          <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
            {seats.filter(s => s.assignment).length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">Nenhum passageiro atribuído</p>
            ) : (
              seats
                .filter(s => s.assignment)
                .sort((a, b) => a.seat_number - b.seat_number)
                .map(seat => (
                  <div key={seat.id} className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-700/50 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors group">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{seat.seat_number}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">
                          {seat.assignment!.passenger?.full_name}
                        </p>
                        {captainPassengerIds.has(seat.assignment!.passenger_id) && (
                          <Anchor className="w-3 h-3 text-amber-500 flex-shrink-0" title="Capitão" />
                        )}
                      </div>
                      <p className="text-xs text-stone-400">
                        {formatDocumentType(seat.assignment!.passenger?.document_type!)} · {seat.assignment!.passenger?.document_number}
                      </p>
                    </div>
                    <button
                      onClick={() => updatePayment(seat.assignment!.id, seat.assignment!.payment_status === 'paid' ? 'pending' : 'paid')}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        seat.assignment!.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400'
                      }`}
                    >
                      {seat.assignment!.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                    </button>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* Seat Modal */}
      {selectedSeat && !substitutingFor && (
        <SeatModal
          open={showSeatModal}
          seat={selectedSeat}
          passengers={passengers}
          onClose={() => setShowSeatModal(false)}
          onAssign={assignPassenger}
          onRemove={() => { setShowCancelModal(true) }}
          onSubstitute={() => { setSubstitutingFor(selectedSeat); }}
          onUpdatePayment={(status) => selectedSeat.assignment && updatePayment(selectedSeat.assignment.id, status)}
        />
      )}

      {/* Cancellation / Desistência modal */}
      <Modal
        open={showCancelModal}
        onClose={() => { setShowCancelModal(false); setCancelReason('') }}
        title="Registrar Desistência"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setShowCancelModal(false); setCancelReason('') }}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={() => removePassenger(cancelReason || 'Desistência')}>
              Confirmar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-500">Motivo da desistência (opcional):</p>
          <div className="flex flex-col gap-2">
            {['Desistiu da viagem', 'Problema de saúde', 'Motivo pessoal', 'Foi em outro veículo', 'Outro'].map(opt => (
              <button
                key={opt}
                onClick={() => setCancelReason(opt)}
                className={`text-left px-3 py-3 rounded-xl border-2 text-sm transition-all ${
                  cancelReason === opt ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-900/20' : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Substitution modal */}
      {substitutingFor && (
        <SubstitutionModal
          open={!!substitutingFor}
          seat={substitutingFor}
          passengers={passengers}
          onClose={() => setSubstitutingFor(null)}
          onSubstitute={substitutePassenger}
        />
      )}

      {/* Modal de conflito: passageiro já tem assento neste veículo */}
      <ConfirmDialog
        open={!!moveConflict}
        onClose={() => setMoveConflict(null)}
        onConfirm={confirmMovePassenger}
        variant="warning"
        title="Passageiro Já Possui Assento"
        message={moveConflict
          ? `${moveConflict.passengerName} já está no assento ${moveConflict.oldSeatNumber}. Deseja transferi-lo para o assento ${selectedSeat?.seat_number}? O assento ${moveConflict.oldSeatNumber} ficará vazio.`
          : ''}
        confirmLabel="Transferir de Assento"
      />

      {/* Aviso de excesso de alterações após fechamento */}
      <ConfirmDialog
        open={postCloseWarning}
        onClose={() => { setPostCloseWarning(false); setPendingChange(null) }}
        onConfirm={async () => {
          setPostCloseWarning(false)
          if (pendingChange) await pendingChange()
          setPendingChange(null)
        }}
        variant="warning"
        title="Muitas Alterações Após Fechamento"
        message={`Você já realizou ${vehicle.post_close_changes ?? 0} alterações após o fechamento da lista. Isso pode causar divergência com a lista enviada à transportadora. Deseja continuar mesmo assim?`}
        confirmLabel="Continuar"
      />
      <ConfirmDialog
        open={showFinalizeModal}
        onClose={() => setShowFinalizeModal(false)}
        onConfirm={handleFinalizeList}
        variant="warning"
        title="Fechar Lista de Passageiros"
        message="A lista será marcada como finalizada e ficará visível para o SuperAdmin. Você poderá continuar fazendo alterações, mas elas ficarão registradas como alterações pós-fechamento. Deseja continuar?"
        confirmLabel="Fechar Lista"
        loading={finalizing}
      />
    </div>
  )
}

// --- SeatModal ---
function SeatModal({ open, seat, passengers, onClose, onAssign, onRemove, onSubstitute, onUpdatePayment }: {
  open: boolean
  seat: SeatWithAssignment
  passengers: Passenger[]
  onClose: () => void
  onAssign: (passengerId: string) => void
  onRemove: () => void
  onSubstitute: () => void
  onUpdatePayment: (status: PaymentStatus) => void
}) {
  const [selectedPassenger, setSelectedPassenger] = useState('')
  const [search, setSearch] = useState('')
  const occupied = !!seat.assignment

  // Lap children cannot occupy seats
  const eligible = passengers.filter(p => p.passenger_type !== 'lap_child')
  const filtered = eligible.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.document_number.includes(search)
  )

  const occupiedFooter = (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={onSubstitute} className="flex-1">
          Substituir
        </Button>
        <Button variant="danger" size="sm" icon={<X className="w-4 h-4" />} onClick={onRemove} className="flex-1">
          Desistência
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={onClose} className="w-full">Fechar</Button>
    </div>
  )

  const emptyFooter = (
    <div className="flex gap-3">
      <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button onClick={() => selectedPassenger && onAssign(selectedPassenger)} disabled={!selectedPassenger} className="flex-1">
        Atribuir
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assento ${seat.seat_number} — ${occupied ? 'Ocupado' : 'Livre'}`}
      size="md"
      footer={occupied ? occupiedFooter : emptyFooter}
    >
      {occupied ? (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-200 dark:bg-amber-900/40 flex items-center justify-center">
                <User className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-stone-800 dark:text-stone-100">{seat.assignment!.passenger?.full_name}</p>
                <p className="text-xs text-stone-400">
                  {formatDocumentType(seat.assignment!.passenger?.document_type!)} · {seat.assignment!.passenger?.document_number}
                </p>
              </div>
            </div>
            {seat.assignment!.passenger?.is_minor && (
              <Badge variant="warning">Menor de idade</Badge>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onUpdatePayment('paid')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 cursor-pointer transition-all ${
                seat.assignment!.payment_status === 'paid'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'border-stone-200 text-stone-500 hover:border-emerald-300 dark:border-stone-600'
              }`}
            >
              ✓ Pago
            </button>
            <button
              onClick={() => onUpdatePayment('pending')}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border-2 cursor-pointer transition-all ${
                seat.assignment!.payment_status === 'pending'
                  ? 'border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                  : 'border-stone-200 text-stone-500 hover:border-rose-300 dark:border-stone-600'
              }`}
            >
              ⏳ Pendente
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Selecione um passageiro para o assento {seat.seat_number}:
          </p>
          <input
            placeholder="Pesquisar passageiro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex flex-col gap-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-4">Nenhum passageiro disponível</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPassenger(p.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedPassenger === p.id
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-700'
                  }`}
                >
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{p.full_name}</p>
                  <p className="text-xs text-stone-400">{formatDocumentType(p.document_type)} · {p.document_number}</p>
                  {p.is_minor && <Badge variant="warning" className="mt-1">Menor</Badge>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

// --- SubstitutionModal ---
function SubstitutionModal({ open, seat, passengers, onClose, onSubstitute }: {
  open: boolean
  seat: SeatWithAssignment
  passengers: Passenger[]
  onClose: () => void
  onSubstitute: (passengerId: string) => void
}) {
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')

  const eligible = passengers.filter(p => p.passenger_type !== 'lap_child')
  const filtered = eligible.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.document_number.includes(search)
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Substituir no Assento ${seat.seat_number}`}
      size="md"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button icon={<RefreshCw className="w-4 h-4" />} onClick={() => selected && onSubstitute(selected)} disabled={!selected} className="flex-1">
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-700 dark:text-amber-400">
          <p className="font-medium">Substituindo: {seat.assignment?.passenger?.full_name}</p>
          <p className="text-xs mt-0.5 text-amber-600/70">Selecione o passageiro substituto</p>
        </div>
        <input
          placeholder="Pesquisar passageiro..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="flex flex-col gap-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-4">Nenhum passageiro disponível</p>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  selected === p.id
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-transparent hover:bg-stone-50 dark:hover:bg-stone-700'
                }`}
              >
                <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{p.full_name}</p>
                <p className="text-xs text-stone-400">{formatDocumentType(p.document_type)} · {p.document_number}</p>
                {p.is_minor && <Badge variant="warning" className="mt-1">Menor</Badge>}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
