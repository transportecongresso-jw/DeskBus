import { useEffect, useState } from 'react'
import {
  BarChart3, Bus, Users, TrendingUp, TrendingDown, CheckCircle2,
  RefreshCw, Building2, ArrowRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Congregation, EventDay } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleRow {
  id: string
  name: string
  capacity: number
  congregation_id: string
  event_day_id: string | null
  assigned: number
}

interface DayGroup {
  dayId: string
  dayLabel: string
  dayOrder: number
  vehicles: VehicleRow[]
}

interface CongAvailability {
  congregationId: string
  congregationName: string
  city: string | null
  totalAvailable: number
  days: DayGroup[]
}

interface CongregationStats {
  congregation: Congregation
  vehicleCount: number
  totalSeats: number
  assigned: number
  available: number
  excess: number
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AvailabilityPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const { selectedEvent, eventDays } = useEvent()

  const [tab, setTab] = useState<'summary' | 'cross'>('cross')
  const [summaryStats, setSummaryStats] = useState<CongregationStats[]>([])
  const [crossData, setCrossData] = useState<CongAvailability[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDay, setFilterDay] = useState<string>('all')

  useEffect(() => {
    if (selectedEvent) loadAll()
    else setLoading(false)
  }, [selectedEvent, filterDay, congregationIds])

  async function loadAll() {
    setLoading(true)
    try {
      const { data: allCongs } = await supabase.from('congregations').select('*').order('name')
      if (!allCongs || allCongs.length === 0) { setSummaryStats([]); setCrossData([]); return }

      let vQuery = supabase.from('vehicles')
        .select('id, name, capacity, congregation_id, event_day_id')
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

      // ── Summary stats (existing "all-scope" view, admins see all) ──
      const congScope = isAdminGeneral ? allCongs : allCongs.filter(c => congregationIds.includes(c.id))
      const summary: CongregationStats[] = congScope.map(cong => {
        const cv = (vehicles ?? []).filter(v => v.congregation_id === cong.id)
        const totalSeats = cv.reduce((s, v) => s + v.capacity, 0)
        const assigned = cv.reduce((s, v) => s + (assignMap.get(v.id) ?? 0), 0)
        return {
          congregation: cong,
          vehicleCount: cv.length,
          totalSeats,
          assigned,
          available: Math.max(0, totalSeats - assigned),
          excess: Math.max(0, assigned - totalSeats),
        }
      }).filter(s => s.vehicleCount > 0)
      setSummaryStats(summary)

      // ── Cross-congregation view ──
      // For congregation admins: exclude their own congregations
      // For SuperAdmin: show all congregations
      const excludeIds = isAdminGeneral ? [] : congregationIds
      const otherCongs = allCongs.filter(c => !excludeIds.includes(c.id))

      const relevantEventDays = eventDays
        .filter(d => d.event_id === selectedEvent!.id)
        .sort((a, b) => a.day_order - b.day_order)

      const vehicleRows: VehicleRow[] = (vehicles ?? []).map(v => ({
        ...v,
        assigned: assignMap.get(v.id) ?? 0,
      }))

      const cross: CongAvailability[] = otherCongs.map(cong => {
        const congVehicles = vehicleRows.filter(v => v.congregation_id === cong.id)

        // Group by day — vehicles without event_day_id go into a general group
        const days: DayGroup[] = []

        if (relevantEventDays.length > 0) {
          // Vehicles assigned to a specific day
          for (const day of relevantEventDays) {
            const veh = congVehicles.filter(v => v.event_day_id === day.id)
            if (veh.length > 0) {
              days.push({ dayId: day.id, dayLabel: day.label, dayOrder: day.day_order, vehicles: veh })
            }
          }
          // Vehicles with no day assigned — show under a generic group
          const noDayVehicles = congVehicles.filter(v => !v.event_day_id)
          if (noDayVehicles.length > 0) {
            days.push({ dayId: 'none', dayLabel: 'Sem dia definido', dayOrder: 999, vehicles: noDayVehicles })
          }
        } else {
          // No event days at all — show all vehicles flat
          if (congVehicles.length > 0) {
            days.push({ dayId: 'none', dayLabel: 'Todos os dias', dayOrder: 0, vehicles: congVehicles })
          }
        }

        const totalAvailable = congVehicles.reduce((s, v) =>
          s + Math.max(0, v.capacity - v.assigned), 0)

        return { congregationId: cong.id, congregationName: cong.name, city: cong.city, totalAvailable, days }
      }).filter(c => c.days.length > 0)

      // Sort: congregations with available seats first
      cross.sort((a, b) => b.totalAvailable - a.totalAvailable)
      setCrossData(cross)
    } finally {
      setLoading(false)
    }
  }

  const currentEventDays = eventDays.filter(d => d.event_id === selectedEvent?.id)
  const dayOptions = [
    { value: 'all', label: 'Todos os dias' },
    ...currentEventDays.map(d => ({ value: d.id, label: d.label })),
  ]

  const totalSeats = summaryStats.reduce((s, x) => s + x.totalSeats, 0)
  const totalAssigned = summaryStats.reduce((s, x) => s + x.assigned, 0)
  const totalAvailable = summaryStats.reduce((s, x) => s + x.available, 0)
  const totalExcess = summaryStats.reduce((s, x) => s + x.excess, 0)
  const totalWithVagas = crossData.filter(c => c.totalAvailable > 0).length

  if (!selectedEvent) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="Disponibilidade" subtitle="Vagas entre congregações" icon={<BarChart3 className="w-6 h-6" />} />
        <Card>
          <div className="text-center py-12 text-stone-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Selecione um evento</p>
            <p className="text-sm mt-1">Use o seletor de evento no topo da tela</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Disponibilidade"
        subtitle="Vagas disponíveis entre congregações"
        icon={<BarChart3 className="w-6 h-6" />}
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={loadAll}>
            Atualizar
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('cross')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'cross'
              ? 'bg-amber-400 text-amber-950'
              : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500'
          }`}
        >
          {isAdminGeneral ? 'Todas as Congregações' : 'Outras Congregações'}
        </button>
        <button
          onClick={() => setTab('summary')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            tab === 'summary'
              ? 'bg-amber-400 text-amber-950'
              : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500'
          }`}
        >
          {isAdminGeneral ? 'Visão Geral' : 'Minha Congregação'}
        </button>
      </div>

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

      {loading ? (
        <Spinner className="py-14" label="Carregando disponibilidade..." />
      ) : tab === 'cross' ? (
        // ══ Cross-congregation view ═══════════════════════════════════════════
        <>
          {/* Info banner */}
          {!isAdminGeneral && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl flex items-start gap-3">
              <Building2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Vagas das demais congregações
                </p>
                <p className="text-xs text-blue-600/80 dark:text-blue-400/70 mt-0.5 leading-relaxed">
                  Se você possui excedentes, identifique aqui as congregações com vagas livres e entre em contato para redistribuir passageiros.
                </p>
              </div>
            </div>
          )}

          {/* Total available badge */}
          {crossData.length > 0 && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {totalWithVagas} congregaç{totalWithVagas !== 1 ? 'ões com vagas' : 'ão com vagas'}
                </span>
              </div>
              <div className="px-4 py-2 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl flex items-center gap-2">
                <Bus className="w-4 h-4 text-stone-400" />
                <span className="text-sm text-stone-500">
                  {crossData.reduce((s, c) => s + c.totalAvailable, 0)} vagas no total
                </span>
              </div>
            </div>
          )}

          {crossData.length === 0 ? (
            <Card>
              <div className="text-center py-12 text-stone-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhuma congregação com dados disponíveis</p>
                <p className="text-sm mt-1">Verifique se o evento possui veículos cadastrados</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {crossData.map(cong => (
                <CongregationCard key={cong.congregationId} cong={cong} />
              ))}
            </div>
          )}

          <p className="text-xs text-stone-400 mt-5 text-center">
            Apenas informações de disponibilidade são exibidas. Nenhum dado pessoal é compartilhado entre congregações.
          </p>
        </>
      ) : (
        // ══ Summary / own congregation view ═══════════════════════════════════
        <>
          {isAdminGeneral && (
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
          )}

          {summaryStats.length === 0 ? (
            <Card>
              <div className="text-center py-12 text-stone-400">
                <Bus className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum veículo cadastrado</p>
                <p className="text-sm mt-1">para o evento selecionado</p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {summaryStats.map(s => {
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
                        <Badge variant="danger">{s.excess} excedente{s.excess !== 1 ? 's' : ''}</Badge>
                      ) : isFull ? (
                        <Badge variant="success">Completo</Badge>
                      ) : (
                        <Badge variant="neutral">{s.available} vaga{s.available !== 1 ? 's' : ''}</Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="bg-stone-50 dark:bg-stone-700 rounded-xl py-2">
                        <p className="text-sm font-bold text-stone-800 dark:text-stone-100">{s.vehicleCount}</p>
                        <p className="text-[10px] text-stone-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <Bus className="w-3 h-3" /> Veículo{s.vehicleCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="bg-stone-50 dark:bg-stone-700 rounded-xl py-2">
                        <p className="text-sm font-bold text-stone-800 dark:text-stone-100">{s.assigned}/{s.totalSeats}</p>
                        <p className="text-[10px] text-stone-400 flex items-center justify-center gap-0.5 mt-0.5">
                          <Users className="w-3 h-3" /> Passageiros
                        </p>
                      </div>
                      <div className={`rounded-xl py-2 ${
                        s.excess > 0 ? 'bg-rose-50 dark:bg-rose-900/20'
                        : s.available > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20'
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
        </>
      )}
    </div>
  )
}

// ─── CongregationCard ──────────────────────────────────────────────────────────

function CongregationCard({ cong }: { cong: CongAvailability }) {
  const hasFreeSeats = cong.totalAvailable > 0

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${
      hasFreeSeats
        ? 'border-emerald-200 dark:border-emerald-700 bg-white dark:bg-stone-800'
        : 'border-stone-100 dark:border-stone-700 bg-white dark:bg-stone-800'
    }`}>
      {/* Congregation header */}
      <div className={`px-4 py-3 flex items-center justify-between gap-3 ${
        hasFreeSeats
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : 'bg-stone-50 dark:bg-stone-700/40'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
            hasFreeSeats
              ? 'bg-emerald-100 dark:bg-emerald-900/40'
              : 'bg-stone-200 dark:bg-stone-600'
          }`}>
            <Building2 className={`w-4 h-4 ${hasFreeSeats ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'}`} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm truncate">
              {cong.congregationName}
            </p>
            {cong.city && <p className="text-xs text-stone-400 leading-tight">{cong.city}</p>}
          </div>
        </div>
        {hasFreeSeats ? (
          <Badge variant="success">
            {cong.totalAvailable} vaga{cong.totalAvailable !== 1 ? 's' : ''} livre{cong.totalAvailable !== 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="neutral">Sem vagas</Badge>
        )}
      </div>

      {/* Days + vehicles */}
      <div className="px-4 py-3 space-y-3">
        {cong.days.map(day => (
          <div key={day.dayId}>
            {/* Day label */}
            {day.dayId !== 'none' && (
              <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-2">
                {day.dayLabel}
              </p>
            )}
            {/* Vehicles */}
            <div className="space-y-1.5">
              {day.vehicles.map(v => {
                const available = Math.max(0, v.capacity - v.assigned)
                const isFull = available === 0
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${
                      isFull
                        ? 'bg-stone-50 dark:bg-stone-700/50'
                        : 'bg-emerald-50 dark:bg-emerald-900/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Bus className={`w-3.5 h-3.5 flex-shrink-0 ${isFull ? 'text-stone-300 dark:text-stone-600' : 'text-emerald-500'}`} />
                      <span className="text-sm text-stone-700 dark:text-stone-200 truncate">{v.name}</span>
                    </div>
                    {isFull ? (
                      <span className="text-xs font-medium text-stone-400 dark:text-stone-500 flex-shrink-0">Fechado</span>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        {available} vaga{available !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
