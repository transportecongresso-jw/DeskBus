import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bus, Users, Building2, TrendingUp, ArrowRight,
  CheckCircle2, Clock, AlertTriangle, FileText
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { formatCurrency, formatDate } from '../lib/utils'

interface CongregationStatus extends Congregation {
  vehicle_count: number
  passenger_count: number
  paid_count: number
  finalized_by_name?: string
}

export function DashboardPage() {
  const { isAdminGeneral, congregationIds, profile } = useAuth()
  const navigate = useNavigate()
  const [congregations, setCongregations] = useState<CongregationStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [totalStats, setTotalStats] = useState({ congregations: 0, vehicles: 0, passengers: 0, finalized: 0, collected: 0 })

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      let cQuery = supabase.from('congregations').select('*').order('name')
      if (!isAdminGeneral && congregationIds.length > 0) cQuery = cQuery.in('id', congregationIds)
      const { data: congs } = await cQuery
      if (!congs) { setLoading(false); return }

      const congIds = congs.map(c => c.id)

      const { data: vehicles } = await supabase.from('vehicles').select('*').in('congregation_id', congIds)
      const vehicleIds = (vehicles ?? []).map(v => v.id)

      const { data: assignments } = vehicleIds.length > 0
        ? await supabase.from('seat_assignments').select('vehicle_id, payment_status').eq('status', 'active').in('vehicle_id', vehicleIds)
        : { data: [] }

      // Load finalizer names
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
        const paid = cAssignments.filter(a => a.payment_status === 'paid').length

        return {
          ...c,
          vehicle_count: cVehicles.length,
          passenger_count: cAssignments.length,
          paid_count: paid,
          finalized_by_name: profiles.find(p => p.id === c.finalized_by)?.full_name,
        }
      })

      setCongregations(withStats)

      // Totals
      const totalPassengers = (assignments ?? []).length
      const totalPaid = (assignments ?? []).filter(a => a.payment_status === 'paid').length
      let collected = 0
      for (const v of (vehicles ?? [])) {
        const count = (assignments ?? []).filter(a => a.vehicle_id === v.id && a.payment_status === 'paid').length
        collected += count * (v.ticket_price ?? 0)
      }

      setTotalStats({
        congregations: congs.length,
        vehicles: (vehicles ?? []).length,
        passengers: totalPassengers,
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
    <div className="animate-fade-in">
      <PageHeader
        title={`${greeting}, ${profile?.full_name?.split(' ')[0] ?? 'Usuário'}!`}
        subtitle="Visão geral do sistema de transporte"
        icon={<TrendingUp className="w-6 h-6" />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {isAdminGeneral && (
          <StatCard label="Congregações" value={totalStats.congregations} icon={<Building2 className="w-5 h-5" />} color="blue" help="Total de congregações" />
        )}
        <StatCard label="Listas Finalizadas" value={totalStats.finalized} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald"
          sub={`de ${totalStats.congregations}`} help="Congregações que finalizaram sua lista" />
        <StatCard label="Veículos" value={totalStats.vehicles} icon={<Bus className="w-5 h-5" />} color="amber" help="Total de veículos" />
        <StatCard label="Passageiros" value={totalStats.passengers} icon={<Users className="w-5 h-5" />} color="orange" help="Total de passageiros alocados" />
        <StatCard label="Arrecadado" value={formatCurrency(totalStats.collected)} icon={<TrendingUp className="w-5 h-5" />} color="emerald" help="Total já recebido" />
      </div>

      {/* Congregation status table */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stone-700 dark:text-stone-200 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-500" />
            Status das Congregações
          </h2>
          {isAdminGeneral && finalized.length > 0 && (
            <Button variant="outline" size="sm" icon={<FileText className="w-4 h-4" />} onClick={() => navigate('/finalized-lists')}>
              Ver listas finalizadas
            </Button>
          )}
        </div>

        {congregations.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">Nenhuma congregação cadastrada</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-700">
                  <th className="text-left py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Congregação</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Veículos</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Passageiros</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Pagos</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-stone-400 uppercase tracking-wide">Finalização</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-700/50">
                {congregations.map(c => (
                  <tr key={c.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors">
                    <td className="py-3 px-3">
                      <p className="font-medium text-stone-800 dark:text-stone-100">{c.name}</p>
                      {c.city && <p className="text-xs text-stone-400">{c.city}</p>}
                    </td>
                    <td className="py-3 px-3 text-center text-stone-600 dark:text-stone-300">{c.vehicle_count}</td>
                    <td className="py-3 px-3 text-center text-stone-600 dark:text-stone-300">{c.passenger_count}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={c.paid_count === c.passenger_count && c.passenger_count > 0 ? 'text-emerald-600 font-medium' : 'text-stone-500'}>
                        {c.paid_count}/{c.passenger_count}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {c.list_status === 'finalized' ? (
                        <Badge variant="success" dot>Lista Finalizada</Badge>
                      ) : (
                        <Badge variant="warning" dot>Em andamento</Badge>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-stone-400">
                      {c.finalized_at ? (
                        <div>
                          <p>{formatDate(c.finalized_at)}</p>
                          {c.finalized_by_name && <p className="text-stone-500">{c.finalized_by_name}</p>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <Button variant="ghost" size="sm" icon={<ArrowRight className="w-4 h-4" />}
                        onClick={() => navigate(`/congregations/${c.id}`)}>
                        Acessar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Alerts */}
      {inProgress.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {inProgress.length} congregaç{inProgress.length === 1 ? 'ão ainda não finalizou' : 'ões ainda não finalizaram'} sua lista
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-0.5">
              {inProgress.map(c => c.name).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
