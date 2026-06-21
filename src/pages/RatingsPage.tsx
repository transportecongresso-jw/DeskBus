import { useEffect, useState } from 'react'
import { Star, Bus, Building2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEvent } from '../contexts/EventContext'
import { Vehicle, Congregation, TransportCompany, VehicleRating } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

const RATING_LABELS: Record<number, string> = { 1: 'Muito Ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' }
const AC_LABELS: Record<number, string> = { 0: 'Não Possui', 1: 'Muito Ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' }
const SEATBELT_LABELS: Record<string, string> = { all_ok: 'Todos funcionando', some_broken: 'Alguns com defeito', many_broken: 'Muitos com defeito' }
const SEATBELT_VARIANTS: Record<string, any> = { all_ok: 'success', some_broken: 'warning', many_broken: 'danger' }

interface RatingWithContext extends VehicleRating {
  vehicle?: Vehicle
  congregation?: Congregation
  company?: TransportCompany
}

export function RatingsPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const { selectedEvent } = useEvent()
  const [ratings, setRatings] = useState<RatingWithContext[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [companies, setCompanies] = useState<TransportCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterCompany, setFilterCompany] = useState('')

  useEffect(() => { loadData() }, [selectedEvent])

  async function loadData() {
    setLoading(true)

    const [{ data: comps }, { data: congs }] = await Promise.all([
      supabase.from('transport_companies').select('*').order('name'),
      supabase.from('congregations').select('*').order('name'),
    ])
    setCompanies(comps ?? [])
    setCongregations(congs ?? [])

    let vQuery = supabase.from('vehicles').select('*').order('name')
    if (selectedEvent) vQuery = vQuery.eq('event_id', selectedEvent.id)
    if (!isAdminGeneral && congregationIds.length > 0) vQuery = vQuery.in('congregation_id', congregationIds)
    const { data: vData } = await vQuery
    setVehicles(vData ?? [])

    let rQuery = supabase.from('vehicle_ratings').select('*').order('created_at', { ascending: false })
    if (selectedEvent) rQuery = rQuery.eq('event_id', selectedEvent.id)
    if (!isAdminGeneral && congregationIds.length > 0) rQuery = rQuery.in('congregation_id', congregationIds)
    const { data: rData } = await rQuery

    const enriched: RatingWithContext[] = (rData ?? []).map(r => ({
      ...r,
      vehicle: (vData ?? []).find(v => v.id === r.vehicle_id),
      congregation: (congs ?? []).find(c => c.id === r.congregation_id),
      company: (comps ?? []).find(c => c.id === (vData ?? []).find(v => v.id === r.vehicle_id)?.transport_company_id),
    }))

    setRatings(enriched)
    setLoading(false)
  }

  // Vehicles not yet rated by this congregation
  const ratedVehicleIds = ratings.map(r => r.vehicle_id)
  const unratedVehicles = vehicles.filter(v => !ratedVehicleIds.includes(v.id))

  const filteredRatings = filterCompany
    ? ratings.filter(r => r.company?.id === filterCompany)
    : ratings

  // Company averages for SuperAdmin ranking
  const companyAverages = companies.map(c => {
    const compRatings = ratings.filter(r => r.company?.id === c.id)
    const avg = compRatings.length > 0
      ? compRatings.reduce((s, r) => s + r.overall_stars, 0) / compRatings.length
      : null
    return { ...c, avg, count: compRatings.length }
  }).filter(c => c.count > 0).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Avaliações de Transporte"
        subtitle="Avalie os veículos e acompanhe o desempenho das empresas"
        icon={<Star className="w-6 h-6" />}
        actions={
          unratedVehicles.length > 0 && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>
              Nova Avaliação
            </Button>
          )
        }
      />

      {loading ? (
        <Spinner className="py-20" label="Carregando avaliações..." />
      ) : (
        <>
          {/* Ranking de empresas — SuperAdmin */}
          {isAdminGeneral && companyAverages.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-stone-500 uppercase tracking-wide mb-3">Ranking de Empresas</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                {companyAverages.map((c, i) => (
                  <div key={c.id} className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${
                    i === 0 ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                    i === 1 ? 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-800' :
                    'border-stone-100 dark:border-stone-700 bg-white dark:bg-stone-800'
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${
                      i === 0 ? 'bg-amber-400 text-amber-950' :
                      i === 1 ? 'bg-stone-300 dark:bg-stone-500 text-stone-700 dark:text-white' :
                      'bg-orange-200 text-orange-800'
                    }`}>{i + 1}º</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm truncate">{c.name}</p>
                      <p className="text-xs text-stone-400">{c.count} avaliação{c.count !== 1 ? 'ões' : ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span className="font-bold text-stone-800 dark:text-stone-100">{c.avg!.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Veículos sem avaliação */}
          {unratedVehicles.length > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
                {unratedVehicles.length} veículo{unratedVehicles.length !== 1 ? 's' : ''} aguardando avaliação
              </p>
              <div className="flex flex-wrap gap-2">
                {unratedVehicles.map(v => (
                  <span key={v.id} className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg">{v.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Filtro por empresa */}
          {isAdminGeneral && companies.length > 0 && (
            <div className="flex items-center gap-3">
              <Select
                value={filterCompany}
                onChange={e => setFilterCompany(e.target.value)}
                options={[
                  { value: '', label: 'Todas as empresas' },
                  ...companies.map(c => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          )}

          {/* Lista de avaliações */}
          {filteredRatings.length === 0 ? (
            <Card>
              <div className="text-center py-10">
                <Star className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">
                  {unratedVehicles.length > 0
                    ? 'Clique em "Nova Avaliação" para avaliar os veículos'
                    : 'Nenhuma avaliação registrada para este evento'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRatings.map(r => (
                <div key={r.id} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-stone-800 dark:text-stone-100">{r.vehicle?.name ?? '—'}</p>
                        {r.company && <Badge variant="info">{r.company.name}</Badge>}
                      </div>
                      {r.congregation && (
                        <p className="text-xs text-stone-400 mt-0.5">{r.congregation.name}</p>
                      )}
                    </div>
                    <StarDisplay value={r.overall_stars} />
                    {expandedId === r.id
                      ? <ChevronUp className="w-4 h-4 text-stone-400 flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-stone-400 flex-shrink-0" />
                    }
                  </button>

                  {expandedId === r.id && (
                    <div className="px-4 pb-4 border-t border-stone-100 dark:border-stone-700 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {r.driver_rating !== null && (
                          <CriterionRow label="Motorista" value={RATING_LABELS[r.driver_rating]} stars={r.driver_rating} />
                        )}
                        {r.cleanliness_rating !== null && (
                          <CriterionRow label="Limpeza" value={RATING_LABELS[r.cleanliness_rating]} stars={r.cleanliness_rating} />
                        )}
                        {r.comfort_rating !== null && (
                          <CriterionRow label="Conforto" value={RATING_LABELS[r.comfort_rating]} stars={r.comfort_rating} />
                        )}
                        {r.condition_rating !== null && (
                          <CriterionRow label="Estado Geral" value={RATING_LABELS[r.condition_rating]} stars={r.condition_rating} />
                        )}
                        {r.ac_rating !== null && (
                          <CriterionRow label="Ar-condicionado" value={AC_LABELS[r.ac_rating]} stars={r.ac_rating > 0 ? r.ac_rating : null} noAc={r.ac_rating === 0} />
                        )}
                        {r.seatbelts && (
                          <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
                            <p className="text-xs text-stone-400 mb-1">Cintos</p>
                            <Badge variant={SEATBELT_VARIANTS[r.seatbelts]}>{SEATBELT_LABELS[r.seatbelts]}</Badge>
                          </div>
                        )}
                      </div>
                      {r.observations && (
                        <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
                          <p className="text-xs text-stone-400 mb-1">Observações</p>
                          <p className="text-sm text-stone-700 dark:text-stone-200 italic">"{r.observations}"</p>
                        </div>
                      )}
                      <p className="text-xs text-stone-400">{new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <RatingForm
        open={showForm}
        onClose={() => setShowForm(false)}
        vehicles={unratedVehicles}
        companies={companies}
        congregations={congregations}
        congregationIds={congregationIds}
        isAdminGeneral={isAdminGeneral}
        eventId={selectedEvent?.id ?? null}
        onSaved={() => { setShowForm(false); loadData() }}
      />
    </div>
  )
}

function StarDisplay({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {[1, 2, 3, 4, 5].map(s => (
        <Star key={s} className={`${size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} ${s <= value ? 'text-amber-400 fill-amber-400' : 'text-stone-200 dark:text-stone-600'}`} />
      ))}
    </div>
  )
}

function CriterionRow({ label, value, stars, noAc }: { label: string; value: string; stars: number | null; noAc?: boolean }) {
  return (
    <div className="p-3 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
      <p className="text-xs text-stone-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{value}</p>
      {stars !== null && !noAc && (
        <div className="flex gap-0.5 mt-1">
          {[1, 2, 3, 4, 5].map(s => (
            <Star key={s} className={`w-3 h-3 ${s <= stars ? 'text-amber-400 fill-amber-400' : 'text-stone-200 dark:text-stone-600'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

function RatingForm({ open, onClose, vehicles, companies, congregations, congregationIds, isAdminGeneral, eventId, onSaved }: {
  open: boolean; onClose: () => void; vehicles: Vehicle[]; companies: TransportCompany[]
  congregations: Congregation[]; congregationIds: string[]; isAdminGeneral: boolean
  eventId: string | null; onSaved: () => void
}) {
  const [vehicleId, setVehicleId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [overallStars, setOverallStars] = useState(0)
  const [driverRating, setDriverRating] = useState(0)
  const [cleanlinessRating, setCleanlinessRating] = useState(0)
  const [comfortRating, setComfortRating] = useState(0)
  const [conditionRating, setConditionRating] = useState(0)
  const [acRating, setAcRating] = useState(0)
  const [seatbelts, setSeatbelts] = useState('')
  const [observations, setObservations] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setVehicleId(vehicles[0]?.id ?? '')
      setCongregationId(!isAdminGeneral && congregationIds.length > 0 ? congregationIds[0] : '')
      setOverallStars(0); setDriverRating(0); setCleanlinessRating(0)
      setComfortRating(0); setConditionRating(0); setAcRating(0)
      setSeatbelts(''); setObservations('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (overallStars === 0) { toast.error('Selecione a avaliação geral (estrelas)'); return }
    if (!vehicleId || !congregationId) { toast.error('Selecione o veículo e a congregação'); return }
    setLoading(true)
    const payload = {
      vehicle_id: vehicleId, congregation_id: congregationId, event_id: eventId,
      overall_stars: overallStars,
      driver_rating: driverRating || null, cleanliness_rating: cleanlinessRating || null,
      comfort_rating: comfortRating || null, condition_rating: conditionRating || null,
      ac_rating: acRating || null, seatbelts: seatbelts || null, observations: observations || null,
    }
    const { error } = await supabase.from('vehicle_ratings').insert(payload)
    if (error) { toast.error(error.code === '23505' ? 'Este veículo já foi avaliado neste evento' : 'Erro ao salvar avaliação'); setLoading(false); return }
    toast.success('Avaliação registrada!')
    setLoading(false)
    onSaved()
  }

  const availableCongreg = isAdminGeneral
    ? congregations
    : congregations.filter(c => congregationIds.includes(c.id))

  return (
    <Modal open={open} onClose={onClose} title="Nova Avaliação de Veículo" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {isAdminGeneral && (
          <Select label="Congregação" value={congregationId} onChange={e => setCongregationId(e.target.value)}
            options={availableCongreg.map(c => ({ value: c.id, label: c.name }))} placeholder="Selecione..." required />
        )}

        <Select label="Veículo" value={vehicleId} onChange={e => setVehicleId(e.target.value)}
          options={vehicles.map(v => ({
            value: v.id,
            label: v.name + (companies.find(c => c.id === v.transport_company_id) ? ` — ${companies.find(c => c.id === v.transport_company_id)!.name}` : '')
          }))}
          placeholder="Selecione o veículo..." required />

        {/* Avaliação geral */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            Avaliação Geral <span className="text-rose-500">*</span>
          </label>
          <StarPicker value={overallStars} onChange={setOverallStars} />
        </div>

        {/* Critérios */}
        <div className="grid grid-cols-1 gap-4">
          <CriterionPicker label="Motorista" value={driverRating} onChange={setDriverRating} options={RATING_LABELS} />
          <CriterionPicker label="Limpeza do Veículo" value={cleanlinessRating} onChange={setCleanlinessRating} options={RATING_LABELS} />
          <CriterionPicker label="Conforto das Poltronas" value={comfortRating} onChange={setComfortRating} options={RATING_LABELS} />
          <CriterionPicker label="Estado Geral do Veículo" value={conditionRating} onChange={setConditionRating} options={RATING_LABELS} />
          <CriterionPicker label="Ar-condicionado" value={acRating} onChange={setAcRating} options={AC_LABELS} includeZero />
        </div>

        {/* Cintos */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">Cintos de Segurança</label>
          <div className="flex flex-col gap-2">
            {Object.entries(SEATBELT_LABELS).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setSeatbelts(k)}
                className={`text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                  seatbelts === k ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                  : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">Observações Livres</label>
          <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3}
            placeholder='"Motorista muito educado, ar-condicionado com vazamento..."'
            className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400" />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">Registrar Avaliação</Button>
        </div>
      </form>
    </Modal>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className="transition-transform hover:scale-110 active:scale-95">
          <Star className={`w-9 h-9 ${s <= value ? 'text-amber-400 fill-amber-400' : 'text-stone-200 dark:text-stone-600 hover:text-amber-200'} transition-colors`} />
        </button>
      ))}
      {value > 0 && <span className="text-sm font-medium text-stone-500 dark:text-stone-400 self-center ml-1">{RATING_LABELS[value]}</span>}
    </div>
  )
}

function CriterionPicker({ label, value, onChange, options, includeZero }: {
  label: string; value: number; onChange: (v: number) => void
  options: Record<number, string>; includeZero?: boolean
}) {
  const keys = includeZero ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {keys.map(k => (
          <button key={k} type="button" onClick={() => onChange(k)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${
              value === k ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
              : 'border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:border-amber-200'
            }`}>
            {options[k]}
          </button>
        ))}
      </div>
    </div>
  )
}
