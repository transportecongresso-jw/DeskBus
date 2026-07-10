import { useState } from 'react'
import { Search, User, Bus, CreditCard, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { HelpIcon } from '../components/ui/Tooltip'
import { Spinner } from '../components/ui/Spinner'
import { formatDocumentType, formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

interface SearchResult {
  passengerId: string
  passengerName: string
  documentType: string
  documentNumber: string
  isMinor: boolean
  guardianName?: string
  assignmentId?: string
  vehicleName?: string
  seatNumber?: number
  paymentStatus?: string
  boardingStatus?: string
  congregationName?: string
}

export function SearchPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)

    try {
      // Build congregation filter — never search without scope
      if (!isAdminGeneral && congregationIds.length === 0) {
        setResults([]); setLoading(false); return
      }
      let cQuery = supabase.from('congregations').select('id, name')
      if (!isAdminGeneral) cQuery = cQuery.in('id', congregationIds)
      const { data: congs } = await cQuery
      const congIds = (congs ?? []).map(c => c.id)

      // Search passengers server-side — always filtered by congregation
      if (congIds.length === 0) { setResults([]); setLoading(false); return }

      const q = query.trim()
      const { data: passengers } = await supabase
        .from('passengers')
        .select('*, guardian:guardian_id(*)')
        .in('congregation_id', congIds)
        .or(`full_name.ilike.%${q}%,document_number.ilike.%${q}%`)
        .limit(100)

      const matched = passengers ?? []

      if (matched.length === 0) { setResults([]); setLoading(false); return }

      // Get assignments for matched passengers
      const { data: assignments } = await supabase
        .from('seat_assignments')
        .select('*, seat:seats(seat_number), vehicle:vehicles(name, congregation_id)')
        .in('passenger_id', matched.map(p => p.id))
        .eq('status', 'active')

      const results: SearchResult[] = matched.map(p => {
        const assignment = (assignments ?? []).find(a => a.passenger_id === p.id)
        return {
          passengerId: p.id,
          passengerName: p.full_name,
          documentType: p.document_type,
          documentNumber: p.document_number,
          isMinor: p.is_minor,
          guardianName: (p.guardian as any)?.full_name,
          assignmentId: assignment?.id,
          vehicleName: assignment?.vehicle?.name,
          seatNumber: assignment?.seat?.seat_number,
          paymentStatus: assignment?.payment_status,
          boardingStatus: assignment?.boarding_status,
          congregationName: congs?.find(c => c.id === p.congregation_id)?.name,
        }
      })

      setResults(results)
    } finally {
      setLoading(false)
    }
  }

  async function togglePayment(result: SearchResult) {
    if (!result.assignmentId) return
    const newStatus = result.paymentStatus === 'paid' ? 'pending' : 'paid'
    const { error } = await supabase
      .from('seat_assignments')
      .update({ payment_status: newStatus })
      .eq('id', result.assignmentId)

    if (error) { toast.error('Erro ao atualizar pagamento'); return }
    toast.success(newStatus === 'paid' ? 'Marcado como pago!' : 'Marcado como pendente')
    setResults(prev => prev.map(r =>
      r.assignmentId === result.assignmentId ? { ...r, paymentStatus: newStatus } : r
    ))
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Pesquisa Global"
        subtitle="Localize qualquer passageiro rapidamente"
        icon={<Search className="w-6 h-6" />}
      />

      <Card className="mb-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Nome, CPF, RG, Certidão ou nome do responsável..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-700 dark:text-stone-200"
            />
          </div>
          <Button type="submit" loading={loading} size="lg">Pesquisar</Button>
          <HelpIcon
            content="Pesquise por qualquer parte do nome, número de documento ou nome do responsável. A pesquisa retorna passageiros de todas as congregações que você gerencia."
            position="left"
          />
        </form>
      </Card>

      {loading && <Spinner className="py-10" label="Pesquisando..." />}

      {!loading && searched && results.length === 0 && (
        <Card>
          <div className="text-center py-10 text-stone-400">
            <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Nenhum resultado encontrado</p>
            <p className="text-xs mt-1">Tente pesquisar com termos diferentes</p>
          </div>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone-400">{results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}</p>
          {results.map(result => (
            <Card key={result.passengerId} padding="none" className="overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-stone-800 dark:text-stone-100">{result.passengerName}</p>
                        {result.isMinor && <Badge variant="warning">Menor</Badge>}
                        {result.congregationName && <Badge variant="neutral">{result.congregationName}</Badge>}
                      </div>
                      <p className="text-xs text-stone-400">
                        {formatDocumentType(result.documentType as any)} · {result.documentNumber}
                      </p>
                      {result.guardianName && (
                        <p className="text-xs text-stone-400">Responsável: {result.guardianName}</p>
                      )}
                    </div>
                  </div>

                  {result.assignmentId && (
                    <Button
                      variant={result.paymentStatus === 'paid' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => togglePayment(result)}
                      icon={result.paymentStatus === 'paid' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Clock className="w-4 h-4" />}
                    >
                      {result.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                    </Button>
                  )}
                </div>

                {result.assignmentId ? (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <InfoChip icon={<Bus className="w-3.5 h-3.5" />} label="Veículo" value={result.vehicleName ?? '-'} />
                    <InfoChip icon={<CreditCard className="w-3.5 h-3.5" />} label="Assento" value={`#${result.seatNumber ?? '-'}`} />
                    <InfoChip
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      label="Pagamento"
                      value={result.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                      highlight={result.paymentStatus === 'paid' ? 'emerald' : 'rose'}
                    />
                    <InfoChip
                      icon={<User className="w-3.5 h-3.5" />}
                      label="Embarque"
                      value={result.boardingStatus === 'boarded' ? 'Embarcou' : result.boardingStatus === 'not_boarded' ? 'Ausente' : 'Pendente'}
                      highlight={result.boardingStatus === 'boarded' ? 'emerald' : result.boardingStatus === 'not_boarded' ? 'rose' : 'amber'}
                    />
                  </div>
                ) : (
                  <div className="mt-3 px-3 py-2 bg-stone-50 dark:bg-stone-700 rounded-xl text-xs text-stone-400">
                    ℹ️ Este passageiro ainda não possui assento atribuído
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoChip({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: 'emerald' | 'rose' | 'amber'
}) {
  const colors = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }
  return (
    <div className="flex flex-col p-2.5 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
      <div className="flex items-center gap-1.5 text-stone-400 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${highlight ? colors[highlight] : 'text-stone-700 dark:text-stone-200'}`}>
        {value}
      </p>
    </div>
  )
}
