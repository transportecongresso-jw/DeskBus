import { useEffect, useState, useCallback, useRef } from 'react'
import { Anchor, Bus, Users, Search, AlertTriangle, UserX, UserCheck, X, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import toast from 'react-hot-toast'

interface Captain {
  id: string
  full_name: string
  email: string
  phone: string | null
  congregation_id: string
}

interface VehicleOption {
  id: string
  name: string
  type: string
  congregation_id: string
  capacity: number
}

interface CongregationInfo {
  id: string
  name: string
  city: string | null
}

interface PassengerLink {
  passengerId: string
  passengerName: string
}

interface PassengerResult {
  id: string
  full_name: string
}

export function CaptainsPage() {
  const { user, profile, congregationIds, isAdminGeneral } = useAuth()
  const [congregations, setCongregations] = useState<CongregationInfo[]>([])
  const [captains, setCaptains] = useState<Captain[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [assignments, setAssignments] = useState<Set<string>>(new Set()) // "captainId:vehicleId"
  const [passengerLinks, setPassengerLinks] = useState<Map<string, PassengerLink>>(new Map())
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Passenger link state
  const [linkingCaptainId, setLinkingCaptainId] = useState<string | null>(null)
  const [passengerSearch, setPassengerSearch] = useState('')
  const [passengerResults, setPassengerResults] = useState<PassengerResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [linkSaving, setLinkSaving] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Congregações
      let congQuery = supabase.from('congregations').select('id, name, city').order('name')
      if (!isAdminGeneral && congregationIds.length > 0) {
        congQuery = congQuery.in('id', congregationIds)
      }
      const { data: congs, error: congError } = await congQuery
      if (congError) throw congError
      setCongregations(congs ?? [])

      const congIdList = (congs ?? []).map(c => c.id)
      if (congIdList.length === 0) { setLoading(false); return }

      // 2. Links capitão → congregação
      const { data: links, error: linkError } = await supabase
        .from('congregation_admins')
        .select('user_id, congregation_id')
        .in('congregation_id', congIdList)
      if (linkError) throw linkError

      const captainUserIds = [...new Set((links ?? []).map(l => l.user_id))]

      // 3. Perfis dos capitães
      let captainProfiles: Captain[] = []
      if (captainUserIds.length > 0) {
        const { data: profiles, error: profError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', captainUserIds)
          .eq('role', 'captain')
        if (profError) throw profError

        const captainCongMap: Record<string, string> = {}
        ;(links ?? []).forEach(l => {
          if (!captainCongMap[l.user_id]) captainCongMap[l.user_id] = l.congregation_id
        })

        captainProfiles = (profiles ?? []).map(p => ({
          ...p,
          congregation_id: captainCongMap[p.id] ?? '',
        }))
      }
      setCaptains(captainProfiles)

      // 4. Veículos
      const { data: vehData, error: vehError } = await supabase
        .from('vehicles')
        .select('id, name, type, congregation_id, capacity')
        .in('congregation_id', congIdList)
        .order('name')
      if (vehError) throw vehError
      setVehicles(vehData ?? [])

      // 5. Vínculos veículo-capitão
      const { data: assignData, error: assignError } = await supabase
        .from('captain_vehicles')
        .select('captain_id, vehicle_id')
        .in('congregation_id', congIdList)
      if (assignError) throw assignError
      setAssignments(new Set((assignData ?? []).map(a => `${a.captain_id}:${a.vehicle_id}`)))

      // 6. Vínculos passageiro-capitão
      const { data: pLinks, error: pLinkError } = await supabase
        .from('captain_passenger_links')
        .select('captain_id, passenger_id, passengers:passenger_id(full_name)')
        .in('congregation_id', congIdList)
      if (pLinkError) throw pLinkError

      const linksMap = new Map<string, PassengerLink>()
      ;(pLinks ?? []).forEach((l: any) => {
        linksMap.set(l.captain_id, {
          passengerId: l.passenger_id,
          passengerName: l.passengers?.full_name ?? '',
        })
      })
      setPassengerLinks(linksMap)
    } catch (err: any) {
      console.error('[CaptainsPage] Erro ao carregar dados:', err)
      toast.error('Erro ao carregar dados dos capitães')
    } finally {
      setLoading(false)
    }
  }, [isAdminGeneral, congregationIds])

  useEffect(() => { loadData() }, [loadData])

  // ── Vehicle assignment toggle ────────────────────────────────────
  async function toggleVehicle(captain: Captain, vehicleId: string) {
    const key = `${captain.id}:${vehicleId}`
    const isAssigned = assignments.has(key)
    setToggling(prev => new Set(prev).add(key))
    try {
      if (isAssigned) {
        const { error } = await supabase.from('captain_vehicles').delete().eq('captain_id', captain.id).eq('vehicle_id', vehicleId)
        if (error) throw error
        setAssignments(prev => { const next = new Set(prev); next.delete(key); return next })
      } else {
        const vehicle = vehicles.find(v => v.id === vehicleId)
        const { error } = await supabase.from('captain_vehicles').insert({
          captain_id: captain.id,
          vehicle_id: vehicleId,
          congregation_id: vehicle?.congregation_id ?? captain.congregation_id,
          assigned_by: user?.id,
        })
        if (error) throw error
        setAssignments(prev => new Set(prev).add(key))
      }
    } catch (err: any) {
      toast.error('Erro ao atualizar vínculo de veículo')
    } finally {
      setToggling(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }

  // ── Passenger link ────────────────────────────────────────────────
  function openPassengerLink(captainId: string) {
    setLinkingCaptainId(captainId)
    setPassengerSearch('')
    setPassengerResults([])
  }

  function closePassengerLink() {
    setLinkingCaptainId(null)
    setPassengerSearch('')
    setPassengerResults([])
  }

  function handlePassengerSearchChange(query: string, congregationId: string) {
    setPassengerSearch(query)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (query.length < 2) { setPassengerResults([]); return }
    setSearchLoading(true)
    searchTimeoutRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('passengers')
        .select('id, full_name')
        .eq('congregation_id', congregationId)
        .ilike('full_name', `%${query}%`)
        .order('full_name')
        .limit(8)
      setPassengerResults(data ?? [])
      setSearchLoading(false)
    }, 300)
  }

  async function linkPassenger(captain: Captain, passenger: PassengerResult) {
    setLinkSaving(true)
    try {
      const { error } = await supabase
        .from('captain_passenger_links')
        .upsert({
          captain_id: captain.id,
          passenger_id: passenger.id,
          congregation_id: captain.congregation_id,
          linked_by: user?.id,
        }, { onConflict: 'captain_id' })
      if (error) throw error

      setPassengerLinks(prev => {
        const next = new Map(prev)
        next.set(captain.id, { passengerId: passenger.id, passengerName: passenger.full_name })
        return next
      })
      closePassengerLink()
      toast.success(`${captain.full_name} vinculado a ${passenger.full_name}`)
    } catch {
      toast.error('Erro ao vincular passageiro')
    } finally {
      setLinkSaving(false)
    }
  }

  async function unlinkPassenger(captainId: string, captainName: string) {
    const { error } = await supabase.from('captain_passenger_links').delete().eq('captain_id', captainId)
    if (error) { toast.error('Erro ao remover vínculo'); return }
    setPassengerLinks(prev => { const next = new Map(prev); next.delete(captainId); return next })
    toast.success('Vínculo removido')
  }

  // ── Filters ──────────────────────────────────────────────────────
  const filteredCaptains = search.trim()
    ? captains.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase())
      )
    : captains

  const vehicleTypeLabel: Record<string, string> = { bus: 'Ônibus', van: 'Van', microbus: 'Micro' }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
          <Anchor className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Capitães</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Gerencie veículos e passageiros vinculados</p>
        </div>
      </div>

      {/* Search */}
      {captains.length > 0 && (
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar capitão por nome ou e-mail..."
          leftElement={<Search className="w-4 h-4 text-stone-400" />}
        />
      )}

      {/* Empty state */}
      {captains.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-stone-400 dark:text-stone-500">
          <UserX className="w-12 h-12" />
          <p className="font-medium text-stone-500 dark:text-stone-400">Nenhum capitão cadastrado</p>
          <p className="text-sm text-center max-w-xs">
            Aprove solicitações com perfil "Capitão" para que eles apareçam aqui.
          </p>
        </div>
      )}

      {/* Congregações */}
      {congregations.map(cong => {
        const congCaptains = filteredCaptains.filter(c => c.congregation_id === cong.id)
        const congVehicles = vehicles.filter(v => v.congregation_id === cong.id)
        if (congCaptains.length === 0) return null

        return (
          <section key={cong.id} className="space-y-4">
            {(isAdminGeneral || congregations.length > 1) && (
              <div className="flex items-center gap-2 pb-1 border-b border-stone-200 dark:border-stone-700">
                <Users className="w-4 h-4 text-stone-400" />
                <h2 className="font-semibold text-stone-700 dark:text-stone-300">
                  {cong.name}{cong.city ? ` — ${cong.city}` : ''}
                </h2>
                <span className="text-xs text-stone-400">({congCaptains.length} capitão{congCaptains.length !== 1 ? 'ões' : ''})</span>
              </div>
            )}

            {congCaptains.map(captain => {
              const assignedVehicleCount = congVehicles.filter(v => assignments.has(`${captain.id}:${v.id}`)).length
              const link = passengerLinks.get(captain.id)
              const isLinking = linkingCaptainId === captain.id

              return (
                <div key={captain.id} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden">

                  {/* Captain header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 dark:bg-stone-800/80 border-b border-stone-100 dark:border-stone-700">
                    <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <Anchor className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 dark:text-stone-100 truncate">{captain.full_name}</p>
                      <p className="text-xs text-stone-400 truncate">{captain.email}</p>
                    </div>
                    <Badge variant={assignedVehicleCount > 0 ? 'success' : 'default'}>
                      {assignedVehicleCount === 0 ? 'Sem veículo' : `${assignedVehicleCount} veículo${assignedVehicleCount !== 1 ? 's' : ''}`}
                    </Badge>
                  </div>

                  {/* Passenger link section */}
                  <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${link ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        <span className="text-sm text-stone-600 dark:text-stone-300 truncate">
                          {link
                            ? <><span className="font-medium">{link.passengerName}</span><span className="text-stone-400 ml-1 text-xs">— passageiro</span></>
                            : <span className="text-stone-400 italic text-xs">Nenhum passageiro vinculado</span>
                          }
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {link && !isLinking && (
                          <button
                            onClick={() => unlinkPassenger(captain.id, captain.full_name)}
                            className="text-xs text-rose-400 hover:text-rose-600 transition-colors"
                          >
                            Remover
                          </button>
                        )}
                        {!isLinking && (
                          <button
                            onClick={() => openPassengerLink(captain.id)}
                            className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline transition-colors"
                          >
                            <Link2 className="w-3 h-3" />
                            {link ? 'Alterar' : 'Vincular'}
                          </button>
                        )}
                        {isLinking && (
                          <button onClick={closePassengerLink} className="text-stone-400 hover:text-stone-600 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline passenger search */}
                    {isLinking && (
                      <div className="mt-2 relative">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                          <input
                            value={passengerSearch}
                            onChange={e => handlePassengerSearchChange(e.target.value, captain.congregation_id)}
                            placeholder="Comece a digitar o nome..."
                            autoFocus
                            className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                          {searchLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <Spinner size="sm" />
                            </div>
                          )}
                        </div>

                        {passengerResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl z-20 overflow-hidden">
                            {passengerResults.map(p => (
                              <button
                                key={p.id}
                                onClick={() => linkPassenger(captain, p)}
                                disabled={linkSaving}
                                className="w-full text-left px-4 py-2.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
                                {p.full_name}
                              </button>
                            ))}
                          </div>
                        )}

                        {passengerSearch.length >= 2 && !searchLoading && passengerResults.length === 0 && (
                          <p className="text-xs text-stone-400 mt-1.5 pl-1">Nenhum passageiro encontrado para "{passengerSearch}"</p>
                        )}
                        {passengerSearch.length < 2 && passengerSearch.length > 0 && (
                          <p className="text-xs text-stone-400 mt-1.5 pl-1">Continue digitando para pesquisar...</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vehicle toggles */}
                  <div className="p-4">
                    {congVehicles.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-stone-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Nenhum veículo cadastrado nesta congregação</span>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2">Veículos autorizados</p>
                        <div className="flex flex-wrap gap-2">
                          {congVehicles.map(vehicle => {
                            const key = `${captain.id}:${vehicle.id}`
                            const isAssigned = assignments.has(key)
                            const isTogglingThis = toggling.has(key)
                            return (
                              <button
                                key={vehicle.id}
                                onClick={() => toggleVehicle(captain, vehicle.id)}
                                disabled={isTogglingThis}
                                className={`
                                  flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium
                                  border-2 transition-all duration-150 disabled:opacity-50
                                  ${isAssigned
                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                                    : 'border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:border-amber-200 hover:bg-amber-50/50'}
                                `}
                              >
                                {isTogglingThis ? <Spinner size="sm" /> : <Bus className={`w-3.5 h-3.5 ${isAssigned ? 'text-amber-500' : 'text-stone-400'}`} />}
                                <span>{vehicle.name}</span>
                                <span className={isAssigned ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600'}>
                                  · {vehicleTypeLabel[vehicle.type] ?? vehicle.type}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      {search.trim() && filteredCaptains.length === 0 && captains.length > 0 && (
        <div className="text-center py-8 text-stone-400">Nenhum capitão encontrado para "{search}"</div>
      )}
    </div>
  )
}
