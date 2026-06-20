import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Building2, Bus, Users, CheckCircle2, Clock, ArrowLeft,
  AlertTriangle, Lock, Unlock, Download, Eye, FileText
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Congregation, Vehicle } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Spinner } from '../components/ui/Spinner'
import { logAction } from '../lib/audit'
import { exportToExcel, exportToPDF } from '../lib/export'
import { formatCurrency, formatDate } from '../lib/utils'
import toast from 'react-hot-toast'

interface VehicleWithStats extends Vehicle {
  passenger_count: number
  paid_count: number
  seats: any[]
  assignments: any[]
}

export function CongregationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile, isAdminGeneral } = useAuth()
  const [congregation, setCongregation] = useState<Congregation | null>(null)
  const [vehicles, setVehicles] = useState<VehicleWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [finalizerName, setFinalizerName] = useState('')

  useEffect(() => { if (id) loadData(id) }, [id])

  async function loadData(congId: string) {
    setLoading(true)
    const { data: cong } = await supabase.from('congregations').select('*').eq('id', congId).single()
    if (!cong) { navigate('/dashboard'); return }
    setCongregation(cong)

    if (cong.finalized_by) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', cong.finalized_by).single()
      setFinalizerName(p?.full_name ?? '')
    }

    const { data: vehicleData } = await supabase.from('vehicles').select('*').eq('congregation_id', congId).order('name')
    if (!vehicleData) { setLoading(false); return }

    const vehicleIds = vehicleData.map(v => v.id)
    const { data: allAssignments } = vehicleIds.length > 0
      ? await supabase.from('seat_assignments').select('*, passenger:passengers(*), seat:seats(*)').eq('status', 'active').in('vehicle_id', vehicleIds)
      : { data: [] }
    const { data: allSeats } = vehicleIds.length > 0
      ? await supabase.from('seats').select('*').in('vehicle_id', vehicleIds)
      : { data: [] }

    const withStats: VehicleWithStats[] = vehicleData.map(v => {
      const vAssignments = (allAssignments ?? []).filter(a => a.vehicle_id === v.id)
      const vSeats = (allSeats ?? []).filter(s => s.vehicle_id === v.id)
      return {
        ...v,
        passenger_count: vAssignments.length,
        paid_count: vAssignments.filter(a => a.payment_status === 'paid').length,
        seats: vSeats,
        assignments: vAssignments,
      }
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
        congregationId: congregation.id,
        actionType: 'list_finalized',
        description: `Lista finalizada por ${profile?.full_name}`,
        performedBy: user.id,
      })

      toast.success('Lista finalizada com sucesso! Pode ser enviada para a empresa de transporte.')
      setShowFinalizeModal(false)
      loadData(congregation.id)
    } catch {
      toast.error('Erro ao finalizar lista')
    } finally {
      setFinalizing(false)
    }
  }

  async function handleReopen() {
    if (!congregation || !user) return
    setReopening(true)
    try {
      const { error } = await supabase.from('congregations').update({
        list_status: 'in_progress',
        finalized_at: null,
        finalized_by: null,
      }).eq('id', congregation.id)

      if (error) throw error

      await logAction({
        congregationId: congregation.id,
        actionType: 'list_reopened',
        description: `Lista reaberta por ${profile?.full_name}`,
        performedBy: user.id,
      })

      toast.success('Lista reaberta para edição')
      loadData(congregation.id)
    } catch {
      toast.error('Erro ao reabrir lista')
    } finally {
      setReopening(false)
    }
  }

  async function handleExportAll(type: 'excel' | 'pdf') {
    if (!vehicles.length) return
    try {
      for (const v of vehicles) {
        const seatMap = v.seats.map((s: any) => ({
          ...s,
          assignment: v.assignments.find((a: any) => a.seat_id === s.id),
        }))
        if (type === 'excel') {
          await exportToExcel(v, v.assignments)
        } else {
          await exportToPDF(v, seatMap)
        }
      }
      toast.success(`${vehicles.length} lista${vehicles.length > 1 ? 's' : ''} exportada${vehicles.length > 1 ? 's' : ''}`)
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  const totalPassengers = vehicles.reduce((s, v) => s + v.passenger_count, 0)
  const totalPaid = vehicles.reduce((s, v) => s + v.paid_count, 0)
  const totalCollected = vehicles.reduce((s, v) => s + v.paid_count * (v.ticket_price ?? 0), 0)
  const isFinalized = congregation?.list_status === 'finalized'

  if (loading || !congregation) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/dashboard')}>
          Painel
        </Button>
        <span className="text-stone-300">/</span>
        <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">{congregation.name}</h1>
        {isFinalized ? (
          <Badge variant="success" dot>Lista Finalizada</Badge>
        ) : (
          <Badge variant="warning" dot>Em andamento</Badge>
        )}
      </div>

      {/* Finalization status banner */}
      {isFinalized ? (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Lista Finalizada</p>
              <p className="text-xs text-emerald-600/80 mt-0.5">
                Finalizada em {formatDate(congregation.finalized_at!)}
                {finalizerName && ` por ${finalizerName}`}
              </p>
              <p className="text-xs text-emerald-600/70 mt-1">
                Esta lista pode ser enviada à empresa de transporte. Alterações posteriores ficam registradas em auditoria.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {(isAdminGeneral) && (
              <Button variant="outline" size="sm" icon={<Unlock className="w-4 h-4" />} loading={reopening} onClick={handleReopen}>
                Reabrir
              </Button>
            )}
            <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={() => handleExportAll('excel')}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => handleExportAll('pdf')}>
              PDF
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <button
            onClick={() => setShowFinalizeModal(true)}
            className="w-full p-5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-amber-950 font-bold text-base rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.99]"
          >
            <Lock className="w-5 h-5" />
            Finalizar Lista de Passageiros
            <span className="text-xs font-normal opacity-75 ml-1">({totalPassengers} passageiros)</span>
          </button>
          <p className="text-xs text-stone-400 text-center mt-2">
            Clique quando a lista estiver completa e pronta para ser enviada à empresa de transporte.
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{vehicles.length}</p>
          <p className="text-xs text-stone-400 mt-1">Veículos</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalPassengers}</p>
          <p className="text-xs text-stone-400 mt-1">Passageiros</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-emerald-600">{totalPaid}/{totalPassengers}</p>
          <p className="text-xs text-stone-400 mt-1">Pagos</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCollected)}</p>
          <p className="text-xs text-stone-400 mt-1">Arrecadado</p>
        </Card>
      </div>

      {/* Vehicles list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-2">
            <Bus className="w-4 h-4 text-amber-500" />
            Veículos da Congregação
          </h2>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <Bus className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum veículo cadastrado</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {vehicles.map(v => {
              const pct = v.capacity > 0 ? Math.round((v.passenger_count / v.capacity) * 100) : 0
              return (
                <div key={v.id} className="flex items-center gap-4 p-4 bg-stone-50 dark:bg-stone-700/50 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Bus className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-800 dark:text-stone-100">{v.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-stone-400">{v.type === 'bus' ? 'Ônibus' : 'Van'} · {v.capacity} lugares</p>
                      <p className="text-xs text-stone-500">{v.passenger_count} passageiros · {pct}% cheio</p>
                    </div>
                    <div className="mt-2 h-1.5 bg-stone-200 dark:bg-stone-600 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-emerald-600 font-medium">{v.paid_count} pagos</p>
                    <p className="text-xs text-rose-500">{v.passenger_count - v.paid_count} pendentes</p>
                  </div>
                  <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} onClick={() => navigate(`/vehicles/${v.id}`)}>
                    Ver
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Finalize confirmation modal */}
      <Modal open={showFinalizeModal} onClose={() => setShowFinalizeModal(false)} title="Finalizar Lista de Passageiros" size="sm">
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">Você está confirmando que:</p>
            <ul className="text-sm text-amber-600 dark:text-amber-500 space-y-1 list-disc list-inside">
              <li>A lista de {totalPassengers} passageiro{totalPassengers !== 1 ? 's' : ''} está completa</li>
              <li>Os dados estão corretos e revisados</li>
              <li>A lista está pronta para envio à empresa de transporte</li>
            </ul>
          </div>
          <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl text-xs text-stone-500">
            <p className="font-medium text-stone-600 dark:text-stone-300 mb-1">ℹ️ Após finalizar:</p>
            <p>Você poderá continuar editando, mas todas as alterações serão registradas em auditoria e o SuperAdmin será notificado.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowFinalizeModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={finalizing} icon={<Lock className="w-4 h-4" />} onClick={handleFinalize}>
              Confirmar Finalização
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
