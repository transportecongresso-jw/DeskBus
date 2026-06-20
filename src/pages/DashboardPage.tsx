import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, Users, Building2, DollarSign, TrendingUp, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/layout/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { formatCurrency } from '../lib/utils'

interface DashboardStats {
  congregations: number
  vehicles: number
  passengers: number
  paid: number
  pending: number
  collected: number
}

interface RecentVehicle {
  id: string
  name: string
  type: string
  capacity: number
  occupied: number
  congregation_name: string
}

export function DashboardPage() {
  const { isAdminGeneral, congregationIds, profile } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats>({ congregations: 0, vehicles: 0, passengers: 0, paid: 0, pending: 0, collected: 0 })
  const [vehicles, setVehicles] = useState<RecentVehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Build congregation filter
      let congQuery = supabase.from('congregations').select('id, name')
      if (!isAdminGeneral && congregationIds.length > 0) {
        congQuery = congQuery.in('id', congregationIds)
      }
      const { data: congs } = await congQuery
      const congIds = congs?.map(c => c.id) ?? []

      // Vehicles
      let vQuery = supabase.from('vehicles').select('*')
      if (congIds.length > 0) vQuery = vQuery.in('congregation_id', congIds)
      const { data: vehicleData } = await vQuery

      // Assignments
      const vehicleIds = vehicleData?.map(v => v.id) ?? []
      let aQuery = supabase.from('seat_assignments').select('*').eq('status', 'active')
      if (vehicleIds.length > 0) aQuery = aQuery.in('vehicle_id', vehicleIds)
      const { data: assignments } = await aQuery

      const paid = assignments?.filter(a => a.payment_status === 'paid').length ?? 0
      const pending = assignments?.filter(a => a.payment_status === 'pending').length ?? 0

      // Collect per vehicle ticket price
      let collected = 0
      if (vehicleData && assignments) {
        for (const v of vehicleData) {
          const count = assignments.filter(a => a.vehicle_id === v.id && a.payment_status === 'paid').length
          collected += count * (v.ticket_price ?? 0)
        }
      }

      setStats({
        congregations: congs?.length ?? 0,
        vehicles: vehicleData?.length ?? 0,
        passengers: assignments?.length ?? 0,
        paid,
        pending,
        collected,
      })

      // Recent vehicles with occupancy
      const recent: RecentVehicle[] = (vehicleData ?? []).slice(0, 6).map(v => ({
        id: v.id,
        name: v.name,
        type: v.type,
        capacity: v.capacity,
        occupied: assignments?.filter(a => a.vehicle_id === v.id).length ?? 0,
        congregation_name: congs?.find(c => c.id === v.congregation_id)?.name ?? '',
      }))
      setVehicles(recent)
    } finally {
      setLoading(false)
    }
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Spinner size="lg" label="Carregando painel..." />
    </div>
  )

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`${greeting}, ${profile?.full_name?.split(' ')[0] ?? 'Usuário'}!`}
        subtitle="Aqui está um resumo do seu sistema de transporte"
        icon={<TrendingUp className="w-6 h-6" />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {isAdminGeneral && (
          <StatCard
            label="Congregações"
            value={stats.congregations}
            icon={<Building2 className="w-5 h-5" />}
            color="blue"
            help="Total de congregações cadastradas no sistema"
          />
        )}
        <StatCard
          label="Veículos"
          value={stats.vehicles}
          icon={<Bus className="w-5 h-5" />}
          color="amber"
          help="Total de veículos cadastrados"
        />
        <StatCard
          label="Passageiros"
          value={stats.passengers}
          icon={<Users className="w-5 h-5" />}
          color="orange"
          help="Total de passageiros com assento reservado"
        />
        <StatCard
          label="Pagamentos"
          value={stats.paid}
          icon={<DollarSign className="w-5 h-5" />}
          color="emerald"
          sub={`${stats.pending} pendentes`}
          help="Passageiros com pagamento confirmado"
        />
        <StatCard
          label="Arrecadado"
          value={formatCurrency(stats.collected)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="emerald"
          help="Valor total já recebido de passageiros pagos"
        />
      </div>

      {/* Vehicles overview */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stone-700 dark:text-stone-200">Visão dos Veículos</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/vehicles')} icon={<ArrowRight className="w-4 h-4" />}>
            Ver todos
          </Button>
        </div>
        {vehicles.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <Bus className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum veículo cadastrado ainda</p>
            <Button className="mt-3" size="sm" onClick={() => navigate('/vehicles')}>
              Cadastrar veículo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicles.map(v => {
              const pct = Math.min(100, Math.round((v.occupied / v.capacity) * 100))
              const isFull = v.occupied >= v.capacity
              return (
                <div
                  key={v.id}
                  onClick={() => navigate(`/vehicles/${v.id}`)}
                  className="p-4 rounded-xl border border-stone-100 dark:border-stone-700 hover:border-amber-200 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-stone-800 dark:text-stone-100 text-sm">{v.name}</p>
                      <p className="text-xs text-stone-400">{v.congregation_name}</p>
                    </div>
                    <Badge variant={isFull ? 'success' : 'neutral'} dot>
                      {v.type === 'bus' ? 'Ônibus' : 'Van'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-stone-500 mb-2">
                    <span>{v.occupied}/{v.capacity} lugares</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isFull ? 'bg-emerald-500' : pct > 80 ? 'bg-amber-400' : 'bg-amber-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
