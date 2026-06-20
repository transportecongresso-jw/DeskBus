import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Bus, Users, DollarSign, Download, ArrowLeft, AlertTriangle,
  User, X, RefreshCw, CheckCircle2, Clock, FileSpreadsheet, FileText
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Vehicle, SeatWithAssignment, Passenger, PaymentStatus } from '../types'
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
import { formatCurrency, formatDocumentType } from '../lib/utils'
import { exportToExcel, exportToPDF } from '../lib/export'
import toast from 'react-hot-toast'

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [vehicle, setVehicle] = useState<Vehicle | null>(null)
  const [seats, setSeats] = useState<SeatWithAssignment[]>([])
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeat, setSelectedSeat] = useState<SeatWithAssignment | null>(null)
  const [showSeatModal, setShowSeatModal] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportConfirm, setExportConfirm] = useState<'excel' | 'pdf' | null>(null)
  const [changeWarning, setChangeWarning] = useState(false)
  const [pendingChange, setPendingChange] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (id) loadVehicle(id)
  }, [id])

  async function loadVehicle(vehicleId: string) {
    setLoading(true)
    const { data: v } = await supabase.from('vehicles').select('*').eq('id', vehicleId).single()
    if (!v) { navigate('/vehicles'); return }
    setVehicle(v)

    // Load seats with assignments
    const { data: seatData } = await supabase
      .from('seats')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('seat_number')

    const { data: assignData } = await supabase
      .from('seat_assignments')
      .select('*, passenger:passengers(*)')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active')

    const enriched: SeatWithAssignment[] = (seatData ?? []).map(seat => ({
      ...seat,
      assignment: assignData?.find(a => a.seat_id === seat.id) as any ?? undefined,
    }))
    setSeats(enriched)

    // Load unassigned passengers
    const assignedIds = assignData?.map(a => a.passenger_id) ?? []
    let pQuery = supabase.from('passengers').select('*').eq('congregation_id', v.congregation_id).order('full_name')
    const { data: pData } = await pQuery
    setPassengers(pData?.filter(p => !assignedIds.includes(p.id)) ?? [])

    setLoading(false)
  }

  function handleSeatClick(seat: SeatWithAssignment) {
    setSelectedSeat(seat)
    setShowSeatModal(true)
  }

  async function executeChange(action: () => Promise<void>) {
    if (vehicle?.exported_at && vehicle.export_count >= 3) {
      setPendingChange(() => action)
      setChangeWarning(true)
    } else if (vehicle?.exported_at) {
      toast('⚠️ Atenção: lista já foi exportada. Alterações podem causar divergência.', { duration: 4000 })
      await action()
    } else {
      await action()
    }
  }

  async function assignPassenger(passengerId: string) {
    if (!selectedSeat || !vehicle) return
    await executeChange(async () => {
      const { error } = await supabase.from('seat_assignments').insert({
        seat_id: selectedSeat.id,
        passenger_id: passengerId,
        vehicle_id: vehicle.id,
        status: 'active',
        payment_status: 'pending',
        boarding_status: 'pending',
      })
      if (error) { toast.error('Erro ao atribuir passageiro'); return }
      await logAudit(`Passageiro atribuído ao assento ${selectedSeat.seat_number}`)
      toast.success('Passageiro atribuído!')
      setShowSeatModal(false)
      loadVehicle(vehicle.id)
    })
  }

  async function removePassenger() {
    if (!selectedSeat?.assignment || !vehicle) return
    await executeChange(async () => {
      const { error } = await supabase
        .from('seat_assignments')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'Removido pelo administrador' })
        .eq('id', selectedSeat.assignment!.id)
      if (error) { toast.error('Erro ao remover passageiro'); return }
      await logAudit(`Passageiro removido do assento ${selectedSeat.seat_number}`)
      toast.success('Passageiro removido')
      setShowSeatModal(false)
      loadVehicle(vehicle.id)
    })
  }

  async function updatePayment(assignmentId: string, status: PaymentStatus) {
    const { error } = await supabase
      .from('seat_assignments')
      .update({ payment_status: status })
      .eq('id', assignmentId)
    if (!error) {
      toast.success(status === 'paid' ? 'Marcado como pago!' : 'Marcado como pendente')
      loadVehicle(vehicle!.id)
    }
  }

  async function logAudit(description: string) {
    if (!vehicle || !user) return
    await supabase.from('audit_logs').insert({
      vehicle_id: vehicle.id,
      congregation_id: vehicle.congregation_id,
      action_type: 'seat_change',
      description,
      performed_by: user.id,
    })
    // Increment export_count if exported
    if (vehicle.exported_at) {
      await supabase.from('vehicles')
        .update({ export_count: (vehicle.export_count ?? 0) + 1 })
        .eq('id', vehicle.id)
    }
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
      // Mark as exported
      await supabase.from('vehicles').update({ exported_at: new Date().toISOString(), export_count: 0 }).eq('id', vehicle.id)
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
    setExportConfirm(null)
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
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/vehicles')}>
          Veículos
        </Button>
        <span className="text-stone-300">/</span>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">{vehicle.name}</h1>
        <Badge variant="info">{vehicle.type === 'bus' ? 'Ônibus' : 'Van'} · {vehicle.capacity} lugares</Badge>
        {vehicle.exported_at && (
          <Badge variant="warning" dot>
            Lista exportada · {vehicle.export_count} alteraç{vehicle.export_count === 1 ? 'ão' : 'ões'}
          </Badge>
        )}
      </div>

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
                      onClick={() => setExportConfirm('excel')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      Exportar Excel
                    </button>
                    <button
                      onClick={() => setExportConfirm('pdf')}
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
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">
                        {seat.assignment!.passenger?.full_name}
                      </p>
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
      {selectedSeat && (
        <SeatModal
          open={showSeatModal}
          seat={selectedSeat}
          passengers={passengers}
          onClose={() => setShowSeatModal(false)}
          onAssign={assignPassenger}
          onRemove={removePassenger}
          onUpdatePayment={(status) => selectedSeat.assignment && updatePayment(selectedSeat.assignment.id, status)}
        />
      )}

      {/* Export confirm */}
      <ConfirmDialog
        open={!!exportConfirm}
        onClose={() => setExportConfirm(null)}
        onConfirm={() => exportConfirm && handleExport(exportConfirm)}
        variant="warning"
        title="Exportar Lista"
        message="Ao exportar a lista oficial, alterações subsequentes serão rastreadas. Confirmar exportação?"
        confirmLabel="Exportar"
      />

      {/* Change warning after export */}
      <ConfirmDialog
        open={changeWarning}
        onClose={() => { setChangeWarning(false); setPendingChange(null) }}
        onConfirm={async () => {
          setChangeWarning(false)
          if (pendingChange) await pendingChange()
          setPendingChange(null)
        }}
        variant="danger"
        title="Limite de Alterações"
        message={`Este veículo já possui ${vehicle.export_count} alterações após exportação. Isso pode causar divergência entre a lista enviada à empresa e a lista do motorista. Confirmar mesmo assim?`}
        confirmLabel="Confirmar Alteração"
      />
    </div>
  )
}

// --- SeatModal ---
function SeatModal({ open, seat, passengers, onClose, onAssign, onRemove, onUpdatePayment }: {
  open: boolean
  seat: SeatWithAssignment
  passengers: Passenger[]
  onClose: () => void
  onAssign: (passengerId: string) => void
  onRemove: () => void
  onUpdatePayment: (status: PaymentStatus) => void
}) {
  const [selectedPassenger, setSelectedPassenger] = useState('')
  const [search, setSearch] = useState('')
  const occupied = !!seat.assignment

  const filtered = passengers.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.document_number.includes(search)
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assento ${seat.seat_number} — ${occupied ? 'Ocupado' : 'Livre'}`}
      size="md"
    >
      {occupied ? (
        <div className="flex flex-col gap-4">
          {/* Passenger info */}
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

          {/* Payment */}
          <div className="flex gap-3">
            <button
              onClick={() => onUpdatePayment('paid')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 cursor-pointer transition-all ${
                seat.assignment!.payment_status === 'paid'
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                  : 'border-stone-200 text-stone-500 hover:border-emerald-300 dark:border-stone-600'
              }`}
            >
              ✓ Pago
            </button>
            <button
              onClick={() => onUpdatePayment('pending')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 cursor-pointer transition-all ${
                seat.assignment!.payment_status === 'pending'
                  ? 'border-rose-400 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                  : 'border-stone-200 text-stone-500 hover:border-rose-300 dark:border-stone-600'
              }`}
            >
              ⏳ Pendente
            </button>
          </div>

          <Button variant="danger" icon={<X className="w-4 h-4" />} onClick={onRemove}>
            Remover Passageiro / Registrar Desistência
          </Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Selecione um passageiro para atribuir ao assento {seat.seat_number}:
          </p>
          <input
            placeholder="Pesquisar passageiro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
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
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={() => selectedPassenger && onAssign(selectedPassenger)} disabled={!selectedPassenger} className="flex-1">
              Atribuir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
