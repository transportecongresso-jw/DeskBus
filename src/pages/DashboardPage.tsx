import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bus, Users, Building2, TrendingUp, ArrowRight,
  CheckCircle2, Clock, FileText, CalendarDays, RefreshCw
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { formatCurrency } from '../lib/utils'

interface CongregationStatus extends Congregation {
  vehicle_count: number
  passenger_count: number
  paid_count: number
  finalized_by_name?: string
}

export function DashboardPage() {
  const { isAdminGeneral, congregationIds, profile } = useAuth()
  const { selectedEvent } = useEvent()
  const navigate = useNavigate()
  const [congregations, setCongregations] = useState<CongregationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [totalStats, setTotalStats] = useState({ congregations: 0, vehicles: 0, passengers: 0, finalized: 0, collected: 0 })

  useEffect(() => {
    if (!isAdminGeneral && congregationIds.length === 0) { setLoading(false); return }
    loadDashboard()
  }, [selectedEvent, congregationIds, isAdminGeneral])

  async function loadDashboard() {
    setLoading(true)
    try {
      let cQuery = supabase.from('congregations').select('*').order('name')
      if (!isAdminGeneral) cQuery = cQuery.in('id', congregationIds)
      const { data: congs } = await cQuery
      if (!congs) { setLoading(false); return }

      const congIds = congs.map(c => c.id)

      let vQuery = supabase.from('vehicles').select('*').in('congregation_id', congIds)
      if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
      const { data: vehicles } = await vQuery
      const vehicleIds = (vehicles ?? []).map(v => v.id)

      const { data: assignments } = vehicleIds.length > 0
        ? await supabase.from('seat_assignments').select('vehicle_id, payment_status').eq('status', 'active').in('vehicle_id', vehicleIds)
        : { data: [] }

      const finalizerIds = congs.filter(c => c.finalized_by).map(c => c.finalized_by)
      let profiles: any[] = []
      if (finalizerIds.length > 0) {
        const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', finalizerIds)
        profiles = p ?? []
      }

      const withStats: CongregationStatus[] = congs.map(c => {
        const cVehicles = (vehicles ?? []).filter(v => v.congregation_id === c.id)
        const cVehicleIds = cVehicles.map(v => v.id)
        const cAssignments = (assignments ?? []).filter(a => cVehicleIds.includes(a.vehicle_id))
        return {
          ...c,
          vehicle_count: cVehicles.length,
          passenger_count: cAssignments.length,
          paid_count: cAssignments.filter(a => a.payment_status === 'paid').length,
          finalized_by_name: profiles.find(p => p.id === c.finalized_by)?.full_name,
        }
      })

      setCongregations(withStats)

      let collected = 0
      for (const v of (vehicles ?? [])) {
        const count = (assignments ?? []).filter(a => a.vehicle_id === v.id && a.payment_status === 'paid').length
        collected += count * (v.ticket_price ?? 0)
      }
      setTotalStats({
        congregations: congs.length,
        vehicles: (vehicles ?? []).length,
        passengers: (assignments ?? []).length,
        finalized: congs.filter(c => c.list_status === 'finalized').length,
        collected,
      })
    } finally {
      setLoading(false)
    }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const finalized = congregations.filter(c => c.list_status === 'finalized')
  const inProgress = congregations.filter(c => c.list_status === 'in_progress')

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" label="Carregando painel..." /></div>

  return (
    <div className="animate-fade-in space-y-5">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">
            {greeting}, {profile?.full_name?.split(' ')[0] ?? 'Usuário'}!
          </h1>
          {selectedEvent ? (
            <div className="flex items-center gap-1.5 mt-1">
              <CalendarDays className="w-4 h-4 text-amber-500" />
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{selectedEvent.name}</p>
            </div>
          ) : (
            <p className="text-sm text-stone-500 mt-0.5">Visão geral do sistema de transporte</p>
          )}
        </div>
        <button
          onClick={loadDashboard}
          className="p-2.5 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex-shrink-0 mt-1"
          title="Atualizar painel"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Stats grid — 2 cols on mobile */}
      <div className="grid grid-cols-2 gap-3">
        {isAdminGeneral && (
          <StatTile label="Congregações" value={totalStats.congregations} icon={<Building2 className="w-5 h-5" />} color="blue" />
        )}
        <StatTile label="Veículos" value={totalStats.vehicles} icon={<Bus className="w-5 h-5" />} color="amber" />
        <StatTile label="Passageiros" value={totalStats.passengers} icon={<Users className="w-5 h-5" />} color="orange" />
        <StatTile label="Finalizadas" value={`${totalStats.finalized}/${totalStats.congregations}`} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
        <StatTile label="Arrecadado" value={formatCurrency(totalStats.collected)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" wide />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/vehicles')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-amber-400 hover:bg-amber-500 active:scale-95 transition-all text-amber-950">
          <Bus className="w-6 h-6 flex-shrink-0" />
          <div className="text-left">
            <p className="font-semibold text-sm">Veículos</p>
            <p className="text-xs opacity-70">Gerenciar assentos</p>
          </div>
        </button>
        <button onClick={() => navigate('/passengers')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-stone-800 hover:bg-stone-700 active:scale-95 transition-all text-white dark:bg-stone-700 dark:hover:bg-stone-600">
          <Users className="w-6 h-6 flex-shrink-0" />
          <div className="text-left">
            <p className="font-semibold text-sm">Passageiros</p>
            <p className="text-xs opacity-70">Cadastrar / editar</p>
          </div>
        </button>
        <button onClick={() => navigate('/boarding')}
          className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 active:scale-95 transition-all text-stone-700 dark:text-stone-200">
          <CheckCircle2 className="w-6 h-6 flex-shrink-0 text-emerald-500" />
          <div className="text-left">
            <p className="font-semibold text-sm">Embarque</p>
            <p className="text-xs text-stone-400">Controle de entrada</p>
          </div>
        </button>
        {isAdminGeneral && (
          <button onClick={() => navigate('/finalized-lists')}
            className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 active:scale-95 transition-all text-stone-700 dark:text-stone-200">
            <FileText className="w-6 h-6 flex-shrink-0 text-blue-500" />
            <div className="text-left">
              <p className="font-semibold text-sm">Listas</p>
              <p className="text-xs text-stone-400">Finalizadas</p>
            </div>
          </button>
        )}
      </div>

      {/* Congregation status — card list (not table) */}
      {congregations.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide mb-3">
            Status das Congregações
          </h2>
          <div className="space-y-2.5">
            {congregations.map(c => {
              const pct = c.passenger_count > 0 ? Math.round((c.paid_count / c.passenger_count) * 100) : 0
              return (
                <button key={c.id} onClick={() => navigate(`/congregations/${c.id}`)}
                  className="w-full text-left bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 hover:shadow-md active:scale-[0.99] transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-800 dark:text-stone-100 text-base leading-tight">{c.name}</p>
                      {c.city && <p className="text-xs text-stone-400 mt-0.5">{c.city}</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {c.list_status === 'finalized'
                        ? <Badge variant="success" dot>Finalizada</Badge>
                        : <Badge variant="warning" dot>Em andamento</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-stone-700 dark:text-stone-200">{c.vehicle_count}</p>
                      <p className="text-[10px] text-stone-400">Veículos</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-stone-700 dark:text-stone-200">{c.passenger_count}</p>
                      <p className="text-[10px] text-stone-400">Passageiros</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${c.paid_count === c.passenger_count && c.passenger_count > 0 ? 'text-emerald-600' : 'text-stone-700 dark:text-stone-200'}`}>
                        {c.paid_count}
                      </p>
                      <p className="text-[10px] text-stone-400">Pagos</p>
                    </div>
                  </div>

                  {c.passenger_count > 0 && (
                    <div>
                      <div className="flex justify-between text-[10px] text-stone-400 mb-1">
                        <span>Pagamentos</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end mt-2">
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                      Acessar <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Alert */}
      {inProgress.length > 0 && isAdminGeneral && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {inProgress.length} congregaç{inProgress.length === 1 ? 'ão' : 'ões'} em andamento
            </p>
            <p className="text-xs text-amber-600/70 mt-0.5">{inProgress.map(c => c.name).join(', ')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Tile compacto para estatísticas
function StatTile({ label, value, icon, color, wide }: {
  label: string; value: string | number; icon: React.ReactNode; color: string; wide?: boolean
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  }
  return (
    <div className={`bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4 ${wide ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-xl ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100 leading-none">{value}</p>
          <p className="text-xs text-stone-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}
