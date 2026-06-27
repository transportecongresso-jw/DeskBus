import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Building2, Bus, Users, CheckCircle2, Clock, ArrowLeft,
  Lock, Unlock, Download, Eye, FileText, FileSpreadsheet
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Congregation, Vehicle } from '../types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { logAction } from '../lib/audit'
import { exportCongregationToExcel, exportCongregationToPDF, ExportPassengerRow } from '../lib/export'
import { formatCurrency, formatDate } from '../lib/utils'
import toast from 'react-hot-toast'

interface VehicleWithStats extends Vehicle {
  passenger_count: number
  paid_count: number
}

export function CongregationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile, isAdminGeneral } = useAuth()
  const { selectedEvent, eventDays } = useEvent()
  const [congregation, setCongregation] = useState<Congregation | null>(null)
  const [vehicles, setVehicles] = useState<VehicleWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [finalizerName, setFinalizerName] = useState('')

  useEffect(() => { if (id) loadData(id) }, [id, selectedEvent])

  async function loadData(congId: string) {
    setLoading(true)
    const { data: cong } = await supabase.from('congregations').select('*').eq('id', congId).single()
    if (!cong) { navigate('/dashboard'); return }
    setCongregation(cong)

    if (cong.finalized_by) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', cong.finalized_by).single()
      setFinalizerName(p?.full_name ?? '')
    }

    let vQuery = supabase.from('vehicles').select('*').eq('congregation_id', congId).order('name')
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    const { data: vehicleData } = await vQuery
    if (!vehicleData) { setLoading(false); return }

    const vehicleIds = vehicleData.map(v => v.id)
    const { data: assignments } = vehicleIds.length > 0
      ? await supabase.from('seat_assignments').select('vehicle_id, payment_status').eq('status', 'active').in('vehicle_id', vehicleIds)
      : { data: [] }

    const withStats: VehicleWithStats[] = vehicleData.map(v => {
      const va = (assignments ?? []).filter(a => a.vehicle_id === v.id)
      return { ...v, passenger_count: va.length, paid_count: va.filter(a => a.payment_status === 'paid').length }
    })
    setVehicles(withStats)
    setLoading(false)
  }

  async function handleFinalize() {
    if (!congregation || !user) return
    setFinalizing(true)
    try {
      const { error } = await supabase.from('congregations').update({
        list_status: 'finalized',
        finalized_at: new Date().toISOString(),
        finalized_by: user.id,
      }).eq('id', congregation.id)
      if (error) throw error
      await logAction({
        congregationId: congregation.id, actionType: 'list_finalized',
        description: `Lista finalizada por ${profile?.full_name}`, performedBy: user.id,
      })
      toast.success('Lista finalizada!')
      setShowFinalizeModal(false)
      loadData(congregation.id)
    } catch { toast.error('Erro ao finalizar lista') }
    finally { setFinalizing(false) }
  }

  async function handleReopen() {
    if (!congregation || !user) return
    setReopening(true)
    try {
      await supabase.from('congregations').update({ list_status: 'in_progress', finalized_at: null, finalized_by: null }).eq('id', congregation.id)
      await logAction({ congregationId: congregation.id, actionType: 'list_reopened', description: `Lista reaberta por ${profile?.full_name}`, performedBy: user.id })
      toast.success('Lista reaberta para edição')
      loadData(congregation.id)
    } catch { toast.error('Erro ao reabrir lista') }
    finally { setReopening(false) }
  }

  async function handleExport(type: 'excel' | 'pdf') {
    if (!congregation) return
    setExporting(true)
    try {
      // Buscar todos os veículos da congregação no evento selecionado
      let vQuery = supabase.from('vehicles').select('*').eq('congregation_id', congregation.id).order('name')
      if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
      const { data: allVehicles } = await vQuery
      const vList = allVehicles ?? []
      const vehicleIds = vList.map(v => v.id)

      // Seat assignments (sem join)
      const { data: assignments } = vehicleIds.length > 0
        ? await supabase.from('seat_assignments').select('*').eq('status', 'active').in('vehicle_id', vehicleIds)
        : { data: [] }

      // Seats
      const { data: seats } = vehicleIds.length > 0
        ? await supabase.from('seats').select('id, vehicle_id, seat_number').in('vehicle_id', vehicleIds)
        : { data: [] }

      // Passengers (include guardian for minors/lap-children)
      const { data: passengers } = await supabase
        .from('passengers')
        .select('*, guardian:guardian_id(*)')
        .eq('congregation_id', congregation.id)

      const aList = assignments ?? []
      const sList = seats ?? []
      const pList = passengers ?? []

      // Montar mapa de veículo por ID
      const vehicleMap = Object.fromEntries(vList.map(v => [v.id, v]))

      // Construir linhas de export a partir dos seat_assignments.
      // O dia de cada passageiro é derivado do event_day_id do veículo ao qual está alocado,
      // o que é a única fonte confiável de vínculo passageiro → dia no sistema.
      const rows: ExportPassengerRow[] = []

      for (const assignment of aList) {
        const p = pList.find(x => x.id === assignment.passenger_id)
        if (!p) continue
        const seat = sList.find(s => s.id === assignment.seat_id)
        const vehicle = vehicleMap[assignment.vehicle_id]
        rows.push({
          name: p.full_name,
          documentType: p.document_type,
          documentNumber: p.document_number,
          isMinor: p.is_minor,
          passengerType: p.passenger_type,
          guardianName: (p as any).guardian?.full_name ?? '',
          vehicleName: vehicle?.name ?? '',
          seatNumber: seat?.seat_number ?? null,
          paymentStatus: assignment.payment_status,
          eventDayId: vehicle?.event_day_id ?? null,
        })
      }

      if (type === 'excel') {
        await exportCongregationToExcel(congregation, selectedEvent, eventDays, rows)
      } else {
        await exportCongregationToPDF(congregation, selectedEvent, eventDays, rows)
      }
      toast.success('Lista exportada com sucesso!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar lista')
    } finally {
      setExporting(false)
    }
  }

  const totalPassengers = vehicles.reduce((s, v) => s + v.passenger_count, 0)
  const totalPaid = vehicles.reduce((s, v) => s + v.paid_count, 0)
  const totalCollected = vehicles.reduce((s, v) => s + v.paid_count * (v.ticket_price ?? 0), 0)
  const isFinalized = congregation?.list_status === 'finalized'

  if (loading || !congregation) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="animate-fade-in space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/dashboard')}>
          Painel
        </Button>
        <span className="text-stone-300">/</span>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">{congregation.name}</h1>
        {isFinalized ? <Badge variant="success" dot>Lista Fechada</Badge> : <Badge variant="warning" dot>Em andamento</Badge>}
      </div>

      {/* Botão de fechar / banner de fechado */}
      {isFinalized ? (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Lista Fechada</p>
                <p className="text-xs text-emerald-600/80 mt-0.5">
                  {formatDate(congregation.finalized_at!)}{finalizerName && ` · por ${finalizerName}`}
                </p>
              </div>
            </div>
            {isAdminGeneral && (
              <Button variant="outline" size="sm" icon={<Unlock className="w-3.5 h-3.5" />} loading={reopening} onClick={handleReopen}>
                Reabrir
              </Button>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowFinalizeModal(true)}
          className="w-full p-5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-bold text-base rounded-2xl shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-3"
        >
          <Lock className="w-5 h-5" />
          Finalizar Lista de Passageiros
          <span className="text-xs font-normal opacity-75">({totalPassengers} passageiros)</span>
        </button>
      )}

      {/* Export — destaque central */}
      <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Exportar Lista Consolidada</p>
        </div>
        <p className="text-xs text-stone-400 mb-4">
          Gera um único arquivo com todos os passageiros da congregação{eventDays.length > 0 ? `, organizado por dia (${eventDays.map(d => d.label).join(', ')})` : ''}.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="lg"
            icon={<FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
            loading={exporting}
            onClick={() => handleExport('excel')}
            className="w-full"
          >
            Exportar Excel
          </Button>
          <Button
            variant="secondary"
            size="lg"
            icon={<FileText className="w-5 h-5 text-rose-500" />}
            loading={exporting}
            onClick={() => handleExport('pdf')}
            className="w-full"
          >
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 text-center">
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{vehicles.length}</p>
          <p className="text-xs text-stone-400 mt-0.5">Veículos</p>
        </div>
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 text-center">
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalPassengers}</p>
          <p className="text-xs text-stone-400 mt-0.5">Passageiros</p>
        </div>
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 text-center">
          <p className={`text-2xl font-bold ${totalPaid === totalPassengers && totalPassengers > 0 ? 'text-emerald-600' : 'text-stone-800 dark:text-stone-100'}`}>
            {totalPaid}/{totalPassengers}
          </p>
          <p className="text-xs text-stone-400 mt-0.5">Pagos</p>
        </div>
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
          <p className="text-xs text-stone-400 mt-0.5">Arrecadado</p>
        </div>
      </div>

      {/* Vehicles list */}
      <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
        <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Bus className="w-4 h-4 text-amber-500" />
          Veículos da Congregação
        </h2>
        {vehicles.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <Bus className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum veículo cadastrado</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {vehicles.map(v => {
              const pct = v.capacity > 0 ? Math.round((v.passenger_count / v.capacity) * 100) : 0
              return (
                <button
                  key={v.id}
                  onClick={() => navigate(`/vehicles/${v.id}`)}
                  className="w-full text-left flex items-center gap-3 p-4 bg-stone-50 dark:bg-stone-700/50 rounded-xl hover:bg-amber-50 dark:hover:bg-stone-700 transition-all active:scale-[0.99]"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <Bus className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm">{v.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-stone-400">
                      <span>{v.type === 'bus' ? 'Ônibus' : 'Van'} · {v.capacity} lugares</span>
                      <span>·</span>
                      <span>{v.passenger_count} passageiros</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-stone-200 dark:bg-stone-600 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 text-xs">
                    <p className="text-emerald-600 font-medium">{v.paid_count} pagos</p>
                    <p className="text-rose-500">{v.passenger_count - v.paid_count} pendentes</p>
                    <p className="text-amber-500 mt-1 flex items-center gap-0.5 justify-end">Ver <Eye className="w-3 h-3" /></p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Finalize modal */}
      <Modal open={showFinalizeModal} onClose={() => setShowFinalizeModal(false)} title="Finalizar Lista" size="sm">
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Você está confirmando que:</p>
            <ul className="text-sm text-amber-600 dark:text-amber-500 space-y-1 list-disc list-inside">
              <li>A lista de {totalPassengers} passageiro{totalPassengers !== 1 ? 's' : ''} está completa</li>
              <li>Os dados estão corretos e revisados</li>
              <li>A lista está pronta para envio à transportadora</li>
            </ul>
          </div>
          <p className="text-xs text-stone-400">Você poderá continuar editando após fechar, mas alterações ficam registradas em auditoria.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" size="lg" onClick={() => setShowFinalizeModal(false)}>Cancelar</Button>
            <Button className="flex-1" size="lg" loading={finalizing} icon={<Lock className="w-4 h-4" />} onClick={handleFinalize}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
