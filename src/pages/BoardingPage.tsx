import { useEffect, useState } from 'react'
import { ClipboardList, CheckCircle2, XCircle, Clock, Search, Bus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Vehicle, Congregation, BoardingStatus } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { StatCard } from '../components/ui/StatCard'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { HelpIcon } from '../components/ui/Tooltip'
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState('')
  const [entries, setEntries] = useState<BoardingEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | BoardingStatus>('all')
  const [obsModal, setObsModal] = useState<{ entry: BoardingEntry; obs: string } | null>(null)

  useEffect(() => { loadVehicles() }, [])
  useEffect(() => { if (selectedVehicle) loadBoardingList(selectedVehicle) }, [selectedVehicle])

  async function loadVehicles() {
    let cQuery = supabase.from('congregations').select('*').order('name')
    if (!isAdminGeneral && congregationIds.length > 0) cQuery = cQuery.in('id', congregationIds)
    const { data: congs } = await cQuery
    setCongregations(congs ?? [])

    const congIds = (congs ?? []).map(c => c.id)
    let vQuery = supabase.from('vehicles').select('*').order('name')
    if (congIds.length > 0) vQuery = vQuery.in('congregation_id', congIds)
    const { data: vData } = await vQuery
    setVehicles(vData ?? [])
    if (vData && vData.length > 0) setSelectedVehicle(vData[0].id)
  }

  async function loadBoardingList(vehicleId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('seat_assignments')
      .select('*, seat:seats(seat_number), passenger:passengers(*)')
      .eq('vehicle_id', vehicleId)
      .eq('status', 'active')
      .order('seat_id')

    const list: BoardingEntry[] = (data ?? []).map((a: any) => ({
      assignmentId: a.id,
      seatNumber: a.seat?.seat_number ?? 0,
      passengerName: a.passenger?.full_name ?? '',
      documentType: a.passenger?.document_type ?? 'cpf',
      documentNumber: a.passenger?.document_number ?? '',
      isMinor: a.passenger?.is_minor ?? false,
      boardingStatus: a.boarding_status,
      boardingObservation: a.boarding_observation,
      paymentStatus: a.payment_status,
    })).sort((a: BoardingEntry, b: BoardingEntry) => a.seatNumber - b.seatNumber)

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

  function handleNotBoarded(entry: BoardingEntry) {
    setObsModal({ entry, obs: entry.boardingObservation ?? '' })
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

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Embarque"
        subtitle="Controle de embarque por veículo"
        icon={<ClipboardList className="w-6 h-6" />}
      />

      {/* Vehicle selector */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <Select
              label="Selecionar Veículo"
              value={selectedVehicle}
              onChange={e => setSelectedVehicle(e.target.value)}
              options={vehicles.map(v => ({
                value: v.id,
                label: `${v.name}${congregations.length > 1 ? ` — ${congregations.find(c => c.id === v.congregation_id)?.name ?? ''}` : ''}`
              }))}
              placeholder="Selecione um veículo..."
            />
          </div>
          <HelpIcon content="Selecione o veículo para ver e gerenciar o checklist de embarque. Marque cada passageiro conforme embarcar." />
        </div>
      </Card>

      {selectedVehicle && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total" value={entries.length} color="stone" icon={<ClipboardList className="w-4 h-4" />} help="Total de passageiros neste veículo" />
            <StatCard label="Embarcou" value={boarded} color="emerald" icon={<CheckCircle2 className="w-4 h-4" />} help="Passageiros confirmados no embarque" />
            <StatCard label="Pendente" value={pending} color="amber" icon={<Clock className="w-4 h-4" />} help="Passageiros ainda não verificados" />
            <StatCard label="Ausentes" value={notBoarded} color="rose" icon={<XCircle className="w-4 h-4" />} help="Passageiros que não embarcaram" />
          </div>

          {/* Progress bar */}
          {entries.length > 0 && (
            <Card className="mb-4 p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-stone-700 dark:text-stone-200">Progresso do Embarque</span>
                <span className="text-stone-400">{boarded}/{entries.length}</span>
              </div>
              <div className="h-3 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden flex">
                {boarded > 0 && (
                  <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(boarded / entries.length) * 100}%` }} />
                )}
                {notBoarded > 0 && (
                  <div className="h-full bg-rose-400 transition-all" style={{ width: `${(notBoarded / entries.length) * 100}%` }} />
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-stone-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Embarcou</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />Ausente</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stone-200" />Pendente</span>
              </div>
            </Card>
          )}

          <Card>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  placeholder="Pesquisar passageiro..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div className="flex gap-2">
                {([['all', 'Todos'], ['pending', 'Pendentes'], ['boarded', 'Embarcou'], ['not_boarded', 'Ausentes']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFilter(val)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      filter === val
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <Spinner className="py-10" label="Carregando lista de embarque..." />
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-stone-400">
                <Bus className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum passageiro encontrado</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map(entry => (
                  <div
                    key={entry.assignmentId}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      entry.boardingStatus === 'boarded'
                        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800'
                        : entry.boardingStatus === 'not_boarded'
                        ? 'border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800'
                        : 'border-stone-100 dark:border-stone-700 hover:border-amber-200'
                    }`}
                  >
                    {/* Seat number */}
                    <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-stone-500 dark:text-stone-400">{entry.seatNumber}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">{entry.passengerName}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-stone-400">{formatDocumentType(entry.documentType as any)} · {entry.documentNumber}</p>
                        {entry.isMinor && <Badge variant="warning">Menor</Badge>}
                        {entry.paymentStatus === 'pending' && <Badge variant="danger">Pag. Pendente</Badge>}
                        {entry.boardingObservation && (
                          <span className="text-xs text-stone-400 italic">"{entry.boardingObservation}"</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateBoarding(entry.assignmentId, 'boarded')}
                        className={`p-2 rounded-xl transition-all cursor-pointer ${
                          entry.boardingStatus === 'boarded'
                            ? 'bg-emerald-500 text-white'
                            : 'border border-stone-300 dark:border-stone-600 text-stone-400 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-600'
                        }`}
                        title="Marcar como embarcou"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleNotBoarded(entry)}
                        className={`p-2 rounded-xl transition-all cursor-pointer ${
                          entry.boardingStatus === 'not_boarded'
                            ? 'bg-rose-500 text-white'
                            : 'border border-stone-300 dark:border-stone-600 text-stone-400 hover:bg-rose-50 hover:border-rose-400 hover:text-rose-600'
                        }`}
                        title="Marcar como não embarcou"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Observation modal */}
      {obsModal && (
        <Modal open={true} onClose={() => setObsModal(null)} title="Motivo da Ausência" size="sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Informe o motivo pelo qual <strong>{obsModal.entry.passengerName}</strong> não embarcou:
            </p>
            <div className="flex flex-col gap-2">
              {BOARDING_OBSERVATION_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setObsModal(prev => prev ? { ...prev, obs: opt } : null)}
                  className={`px-4 py-3 rounded-xl text-sm text-left border-2 cursor-pointer transition-all ${
                    obsModal.obs === opt
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-amber-300'
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
              className="w-full px-3 py-2.5 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setObsModal(null)} className="flex-1">Cancelar</Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={!obsModal.obs.trim()}
                onClick={async () => {
                  await updateBoarding(obsModal.entry.assignmentId, 'not_boarded', obsModal.obs)
                  setObsModal(null)
                }}
              >
                Confirmar Ausência
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
