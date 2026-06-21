import { useEffect, useState } from 'react'
import { ClipboardList, CheckCircle2, XCircle, Clock, Search, Bus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Vehicle, Congregation, BoardingStatus } from '../types'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { BOARDING_OBSERVATION_OPTIONS, formatDocumentType } from '../lib/utils'
import toast from 'react-hot-toast'

interface BoardingEntry {
  assignmentId: string
  seatNumber: number
  passengerName: string
  documentType: string
  documentNumber: string
  isMinor: boolean
  boardingStatus: BoardingStatus
  boardingObservation: string | null
  paymentStatus: string
}

export function BoardingPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const { selectedEvent } = useEvent()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [entries, setEntries] = useState<BoardingEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | BoardingStatus>('all')
  const [obsModal, setObsModal] = useState<{ entry: BoardingEntry; obs: string } | null>(null)

  useEffect(() => { loadVehicles() }, [selectedEvent])
  useEffect(() => { if (selectedVehicle) loadBoardingList(selectedVehicle) }, [selectedVehicle])

  async function loadVehicles() {
    setInitialLoading(true)
    let cQuery = supabase.from('congregations').select('*').order('name')
    if (!isAdminGeneral && congregationIds.length > 0) cQuery = cQuery.in('id', congregationIds)
    const { data: congs } = await cQuery
    setCongregations(congs ?? [])

    const congIds = (congs ?? []).map(c => c.id)
    let vQuery = supabase.from('vehicles').select('*').order('name')
    if (congIds.length > 0) vQuery = vQuery.in('congregation_id', congIds)
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    const { data: vData } = await vQuery
    setVehicles(vData ?? [])
    if (vData && vData.length > 0) setSelectedVehicle(vData[0].id)
    else setSelectedVehicle('')
    setInitialLoading(false)
  }

  async function loadBoardingList(vehicleId: string) {
    setLoading(true)

    // Queries separadas para evitar problema de join PostgREST + RLS
    const { data: assignments, error: aErr } = await supabase
      .from('seat_assignments')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active')
    if (aErr) console.error('[DeskBus] boarding assignments error:', aErr)

    const assignmentList = assignments ?? []
    if (assignmentList.length === 0) { setEntries([]); setLoading(false); return }

    const seatIds = [...new Set(assignmentList.map(a => a.seat_id))]
    const passengerIds = [...new Set(assignmentList.map(a => a.passenger_id))]

    const [{ data: seats }, { data: passengers }] = await Promise.all([
      supabase.from('seats').select('id, seat_number').in('id', seatIds),
      supabase.from('passengers').select('id, full_name, document_type, document_number, is_minor').in('id', passengerIds),
    ])

    const list: BoardingEntry[] = assignmentList.map(a => {
      const seat = (seats ?? []).find(s => s.id === a.seat_id)
      const passenger = (passengers ?? []).find(p => p.id === a.passenger_id)
      return {
        assignmentId: a.id,
        seatNumber: seat?.seat_number ?? 0,
        passengerName: passenger?.full_name ?? '',
        documentType: passenger?.document_type ?? 'cpf',
        documentNumber: passenger?.document_number ?? '',
        isMinor: passenger?.is_minor ?? false,
        boardingStatus: a.boarding_status,
        boardingObservation: a.boarding_observation,
        paymentStatus: a.payment_status,
      }
    }).sort((a, b) => a.seatNumber - b.seatNumber)

    setEntries(list)
    setLoading(false)
  }

  async function updateBoarding(assignmentId: string, status: BoardingStatus, observation?: string) {
    const { error } = await supabase
      .from('seat_assignments')
      .update({ boarding_status: status, boarding_observation: observation ?? null })
      .eq('id', assignmentId)
    if (error) { toast.error('Erro ao atualizar embarque'); return }

    setEntries(prev => prev.map(e =>
      e.assignmentId === assignmentId
        ? { ...e, boardingStatus: status, boardingObservation: observation ?? null }
        : e
    ))
    toast.success(status === 'boarded' ? 'Embarcou!' : 'Marcado como ausente')
  }

  const filtered = entries.filter(e => {
    const matchSearch = !search ||
      e.passengerName.toLowerCase().includes(search.toLowerCase()) ||
      e.documentNumber.includes(search)
    const matchFilter = filter === 'all' || e.boardingStatus === filter
    return matchSearch && matchFilter
  })

  const boarded = entries.filter(e => e.boardingStatus === 'boarded').length
  const notBoarded = entries.filter(e => e.boardingStatus === 'not_boarded').length
  const pending = entries.filter(e => e.boardingStatus === 'pending').length
  const pct = entries.length > 0 ? Math.round((boarded / entries.length) * 100) : 0

  const selectedVehicleObj = vehicles.find(v => v.id === selectedVehicle)

  if (initialLoading) return (
    <div className="flex items-center justify-center py-24"><Spinner size="lg" label="Carregando..." /></div>
  )

  return (
    <div className="animate-fade-in space-y-4">
      {/* Header compacto */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-amber-500" />
          Embarque
        </h1>
        <p className="text-sm text-stone-500 mt-0.5">Controle de embarque por veículo</p>
      </div>

      {/* Seletor de veículo — destaque total no mobile */}
      {vehicles.length === 0 ? (
        <div className="p-6 bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 text-center">
          <Bus className="w-10 h-10 mx-auto mb-2 text-stone-300" />
          <p className="text-sm text-stone-400">Nenhum veículo disponível para o evento selecionado</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
            <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Veículo</label>
            <div className="grid gap-2">
              {vehicles.map(v => {
                const cong = congregations.find(c => c.id === v.congregation_id)
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicle(v.id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                      selectedVehicle === v.id
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-stone-100 dark:border-stone-700 hover:border-amber-200'
                    }`}
                  >
                    <Bus className={`w-5 h-5 flex-shrink-0 ${selectedVehicle === v.id ? 'text-amber-500' : 'text-stone-400'}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-stone-800 dark:text-stone-100">{v.name}</p>
                      {cong && congregations.length > 1 && (
                        <p className="text-xs text-stone-400">{cong.name}</p>
                      )}
                    </div>
                    {selectedVehicle === v.id && (
                      <CheckCircle2 className="w-4 h-4 text-amber-500 ml-auto flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedVehicle && (
            <>
              {/* Stats — 4 tiles 2x2 no mobile */}
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Total" value={entries.length} color="stone" icon={<ClipboardList className="w-5 h-5" />} />
                <StatTile label="Embarcou" value={boarded} color="emerald" icon={<CheckCircle2 className="w-5 h-5" />} />
                <StatTile label="Pendente" value={pending} color="amber" icon={<Clock className="w-5 h-5" />} />
                <StatTile label="Ausentes" value={notBoarded} color="rose" icon={<XCircle className="w-5 h-5" />} />
              </div>

              {/* Barra de progresso */}
              {entries.length > 0 && (
                <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="text-stone-700 dark:text-stone-200">Progresso</span>
                    <span className="text-amber-600 dark:text-amber-400">{boarded}/{entries.length} ({pct}%)</span>
                  </div>
                  <div className="h-3 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden flex">
                    {boarded > 0 && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(boarded / entries.length) * 100}%` }} />}
                    {notBoarded > 0 && <div className="h-full bg-rose-400 transition-all" style={{ width: `${(notBoarded / entries.length) * 100}%` }} />}
                  </div>
                </div>
              )}

              {/* Pesquisa */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  placeholder="Pesquisar passageiro..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[52px]"
                />
              </div>

              {/* Filtros por status */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {([['all', 'Todos', entries.length], ['pending', 'Pendentes', pending], ['boarded', 'Embarcou', boarded], ['not_boarded', 'Ausentes', notBoarded]] as const).map(([val, label, count]) => (
                  <button
                    key={val}
                    onClick={() => setFilter(val)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all min-h-[44px] ${
                      filter === val
                        ? 'bg-amber-400 text-amber-950'
                        : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === val ? 'bg-amber-300/50' : 'bg-stone-100 dark:bg-stone-700'}`}>{count}</span>
                  </button>
                ))}
              </div>

              {/* Lista de embarque */}
              {loading ? (
                <div className="flex items-center justify-center py-16"><Spinner size="lg" label="Carregando lista..." /></div>
              ) : filtered.length === 0 ? (
                <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-10 text-center">
                  <Bus className="w-10 h-10 mx-auto mb-2 text-stone-300" />
                  <p className="text-sm text-stone-400">
                    {entries.length === 0 ? 'Nenhum passageiro com assento atribuído neste veículo' : 'Nenhum passageiro encontrado'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filtered.map(entry => (
                    <div
                      key={entry.assignmentId}
                      className={`bg-white dark:bg-stone-800 rounded-2xl border-2 transition-all ${
                        entry.boardingStatus === 'boarded'
                          ? 'border-emerald-300 dark:border-emerald-700'
                          : entry.boardingStatus === 'not_boarded'
                          ? 'border-rose-300 dark:border-rose-700'
                          : 'border-stone-100 dark:border-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 p-4">
                        {/* Número do assento */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                          entry.boardingStatus === 'boarded'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : entry.boardingStatus === 'not_boarded'
                            ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        }`}>
                          {entry.seatNumber}
                        </div>

                        {/* Info passageiro */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-stone-800 dark:text-stone-100 truncate">{entry.passengerName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-stone-400">{formatDocumentType(entry.documentType as any)} · {entry.documentNumber}</span>
                            {entry.isMinor && <Badge variant="warning">Menor</Badge>}
                            {entry.paymentStatus === 'pending' && <Badge variant="danger">Pag. Pendente</Badge>}
                          </div>
                          {entry.boardingObservation && (
                            <p className="text-xs text-stone-400 italic mt-0.5">"{entry.boardingObservation}"</p>
                          )}
                        </div>
                      </div>

                      {/* Botões de embarque — linha separada, full width no mobile */}
                      <div className="flex border-t border-stone-100 dark:border-stone-700">
                        <button
                          onClick={() => updateBoarding(entry.assignmentId, entry.boardingStatus === 'boarded' ? 'pending' : 'boarded')}
                          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium rounded-bl-2xl transition-all ${
                            entry.boardingStatus === 'boarded'
                              ? 'bg-emerald-500 text-white'
                              : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                          }`}
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Embarcou
                        </button>
                        <div className="w-px bg-stone-100 dark:bg-stone-700" />
                        <button
                          onClick={() => entry.boardingStatus === 'not_boarded'
                            ? updateBoarding(entry.assignmentId, 'pending')
                            : setObsModal({ entry, obs: entry.boardingObservation ?? '' })}
                          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium rounded-br-2xl transition-all ${
                            entry.boardingStatus === 'not_boarded'
                              ? 'bg-rose-500 text-white'
                              : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/10'
                          }`}
                        >
                          <XCircle className="w-5 h-5" />
                          Ausente
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Modal de ausência */}
      {obsModal && (
        <Modal open={true} onClose={() => setObsModal(null)} title="Motivo da Ausência" size="sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Informe o motivo de <strong>{obsModal.entry.passengerName}</strong> não embarcar:
            </p>
            <div className="flex flex-col gap-2">
              {BOARDING_OBSERVATION_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setObsModal(prev => prev ? { ...prev, obs: opt } : null)}
                  className={`px-4 py-3.5 rounded-xl text-sm text-left border-2 cursor-pointer transition-all min-h-[52px] ${
                    obsModal.obs === opt
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input
              placeholder="Ou descreva outro motivo..."
              value={obsModal.obs}
              onChange={e => setObsModal(prev => prev ? { ...prev, obs: e.target.value } : null)}
              className="w-full px-4 py-3 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[52px]"
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setObsModal(null)} className="flex-1" size="lg">Cancelar</Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                disabled={!obsModal.obs.trim()}
                onClick={async () => {
                  await updateBoarding(obsModal.entry.assignmentId, 'not_boarded', obsModal.obs)
                  setObsModal(null)
                }}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function StatTile({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  const colors: Record<string, string> = {
    stone: 'bg-stone-50 dark:bg-stone-700/50 text-stone-500',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
  }
  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100 leading-none">{value}</p>
          <p className="text-xs text-stone-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}
