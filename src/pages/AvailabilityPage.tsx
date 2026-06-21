import { useEffect, useState } from 'react'
import { BarChart3, Bus, Users, TrendingUp, TrendingDown, CheckCircle2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEvent } from '../contexts/EventContext'
import { Congregation, EventDay } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

interface CongregationStats {
  congregation: Congregation
  vehicleCount: number
  totalSeats: number
  assigned: number
  available: number
  excess: number
}

export function AvailabilityPage() {
  const { selectedEvent, eventDays } = useEvent()
  const [stats, setStats] = useState<CongregationStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDay, setFilterDay] = useState<string>('all')

  useEffect(() => {
    if (selectedEvent) loadStats()
    else setLoading(false)
  }, [selectedEvent, filterDay])

  async function loadStats() {
    setLoading(true)
    try {
      const { data: congs } = await supabase.from('congregations').select('*').order('name')
      if (!congs || congs.length === 0) { setStats([]); return }

      let vQuery = supabase.from('vehicles').select('id, congregation_id, capacity, event_day_id')
        .eq('event_id', selectedEvent!.id)
      if (filterDay !== 'all') vQuery = vQuery.eq('event_day_id', filterDay)
      const { data: vehicles } = await vQuery

      const vehicleIds = (vehicles ?? []).map(v => v.id)

      const { data: assignments } = vehicleIds.length > 0
        ? await supabase.from('seat_assignments').select('vehicle_id')
            .eq('status', 'active').in('vehicle_id', vehicleIds)
        : { data: [] }

      const assignMap = new Map<string, number>()
      for (const a of assignments ?? []) {
        assignMap.set(a.vehicle_id, (assignMap.get(a.vehicle_id) ?? 0) + 1)
      }

      const result: CongregationStats[] = congs.map(cong => {
        const congVehicles = (vehicles ?? []).filter(v => v.congregation_id === cong.id)
        const totalSeats = congVehicles.reduce((s, v) => s + v.capacity, 0)
        const assigned = congVehicles.reduce((s, v) => s + (assignMap.get(v.id) ?? 0), 0)
        const available = Math.max(0, totalSeats - assigned)
        const excess = Math.max(0, assigned - totalSeats)
        return {
          congregation: cong,
          vehicleCount: congVehicles.length,
          totalSeats,
          assigned,
          available,
          excess,
        }
      }).filter(s => s.vehicleCount > 0 || s.totalSeats > 0)

      setStats(result)
    } finally {
      setLoading(false)
    }
  }

  const dayOptions = [
    { value: 'all', label: 'Todos os dias' },
    ...eventDays.filter(d => d.event_id === selectedEvent?.id).map(d => ({ value: d.id, label: d.label })),
  ]

  const totalSeats = stats.reduce((s, x) => s + x.totalSeats, 0)
  const totalAssigned = stats.reduce((s, x) => s + x.assigned, 0)
  const totalAvailable = stats.reduce((s, x) => s + x.available, 0)
  const totalExcess = stats.reduce((s, x) => s + x.excess, 0)

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Disponibilidade"
        subtitle="Vagas e excedentes por congregação"
        icon={<BarChart3 className="w-6 h-6" />}
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={loadStats}>
            Atualizar
          </Button>
        }
      />

      {!selectedEvent ? (
        <Card>
          <div className="text-center py-12 text-stone-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Selecione um evento</p>
            <p className="text-sm mt-1">Use o seletor de evento no topo da tela</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Day filter */}
          {dayOptions.length > 1 && (
            <Card className="mb-4">
              <Select
                label="Filtrar por dia"
                value={filterDay}
                onChange={e => setFilterDay(e.target.value)}
                options={dayOptions}
              />
            </Card>
          )}

          {/* Summary totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Card className="text-center">
              <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalSeats}</p>
              <p className="text-xs text-stone-400 mt-1 flex items-center justify-center gap-1">
                <Bus className="w-3.5 h-3.5" /> Total de vagas
              </p>
            </Card>
            <Card className="text-center">
              <p className="text-2xl font-bold text-stone-800 dark:text-stone-100">{totalAssigned}</p>
              <p className="text-xs text-stone-400 mt-1 flex items-center justify-center gap-1">
                <Users className="w-3.5 h-3.5" /> Passageiros
              </p>
            </Card>
            <Card className="text-center">
              <p className={`text-2xl font-bold ${totalAvailable > 0 ? 'text-emerald-600' : 'text-stone-400'}`}>
                {totalAvailable}
              </p>
              <p className="text-xs text-stone-400 mt-1 flex items-center justify-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Vagas livres
              </p>
            </Card>
            <Card className="text-center">
              <p className={`text-2xl font-bold ${totalExcess > 0 ? 'text-rose-600' : 'text-stone-400'}`}>
                {totalExcess}
              </p>
              <p className="text-xs text-stone-400 mt-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Excedentes
              </p>
            </Card>
          </div>

          {loading ? (
            <Spinner className="py-10" label="Carregando disponibilidade..." />
          ) : stats.length === 0 ? (
            <Card>
              <div className="text-center py-12 text-stone-400">
                <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum veículo cadastrado</p>
                <p className="text-sm mt-1">para o evento selecionado</p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {stats.map(s => {
                const pct = s.totalSeats > 0 ? Math.min(100, Math.round((s.assigned / s.totalSeats) * 100)) : 0
                const isFull = s.available === 0 && s.excess === 0
                return (
                  <Card key={s.congregation.id}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-800 dark:text-stone-100 truncate">
                          {s.congregation.name}
                        </p>
                        {s.congregation.city && (
                          <p className="text-xs text-stone-400">{s.congregation.city}</p>
                        )}
                      </div>
                      {s.excess > 0 ? (
                        <Badge variant="danger">
                          {s.excess} excedente{s.excess !== 1 ? 's' : ''}
                        </Badge>
                      ) : isFull ? (
                        <Badge variant="success">Completo</Badge>
                      ) : (
                        <Badge variant="neutral">
                          {s.available} vaga{s.available !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="bg-stone-50 dark:bg-stone-700 rounded-xl py-2">
                        <p className="text-sm font-bold text-stone-800 dark:text-stone-100">
                          {s.vehicleCount}
                        </p>
                        <p className="text-[10px] text-stone-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <Bus className="w-3 h-3" /> Veículo{s.vehicleCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="bg-stone-50 dark:bg-stone-700 rounded-xl py-2">
                        <p className="text-sm font-bold text-stone-800 dark:text-stone-100">
                          {s.assigned}/{s.totalSeats}
                        </p>
                        <p className="text-[10px] text-stone-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <Users className="w-3 h-3" /> Passageiros
                        </p>
                      </div>
                      <div className={`rounded-xl py-2 ${
                        s.excess > 0
                          ? 'bg-rose-50 dark:bg-rose-900/20'
                          : s.available > 0
                            ? 'bg-emerald-50 dark:bg-emerald-900/20'
                            : 'bg-stone-50 dark:bg-stone-700'
                      }`}>
                        {s.excess > 0 ? (
                          <>
                            <p className="text-sm font-bold text-rose-600">{s.excess}</p>
                            <p className="text-[10px] text-rose-400 flex items-center justify-center gap-0.5 mt-0.5">
                              <TrendingUp className="w-3 h-3" /> Excedente{s.excess !== 1 ? 's' : ''}
                            </p>
                          </>
                        ) : s.available > 0 ? (
                          <>
                            <p className="text-sm font-bold text-emerald-600">{s.available}</p>
                            <p className="text-[10px] text-emerald-500 flex items-center justify-center gap-0.5 mt-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Disponíve{s.available !== 1 ? 'is' : 'l'}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-stone-400">0</p>
                            <p className="text-[10px] text-stone-400 mt-0.5">Vagas</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Occupancy bar */}
                    <div>
                      <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                        <span>Ocupação</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.excess > 0 ? 'bg-rose-500' : pct >= 100 ? 'bg-emerald-500' : pct > 80 ? 'bg-amber-400' : 'bg-amber-300'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          <p className="text-xs text-stone-400 mt-4 text-center">
            Este painel exibe apenas dados resumidos. Informações pessoais não são compartilhadas entre congregações.
          </p>
        </>
      )}
    </div>
  )
}
