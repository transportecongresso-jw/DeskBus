import { useEffect, useState } from 'react'
import { Shield, Search, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { AuditLog, Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { formatDate } from '../lib/utils'

const ACTION_LABELS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  passenger_created:    { label: 'Passageiro cadastrado',   variant: 'success' },
  passenger_updated:    { label: 'Passageiro editado',      variant: 'warning' },
  passenger_deleted:    { label: 'Passageiro removido',     variant: 'danger' },
  seat_assigned:        { label: 'Assento atribuído',       variant: 'info' },
  seat_removed:         { label: 'Removido do assento',     variant: 'warning' },
  seat_substituted:     { label: 'Substituição realizada',  variant: 'warning' },
  payment_paid:         { label: 'Pagamento confirmado',    variant: 'success' },
  payment_pending:      { label: 'Pagamento pendente',      variant: 'neutral' },
  cancellation:         { label: 'Desistência registrada',  variant: 'danger' },
  list_finalized:       { label: 'Lista finalizada',        variant: 'success' },
  list_reopened:        { label: 'Lista reaberta',          variant: 'warning' },
  seat_change:          { label: 'Alteração de assento',    variant: 'neutral' },
}

export function AuditPage() {
  const { isAdminGeneral, congregationIds } = useAuth()
  const [logs, setLogs] = useState<(AuditLog & { performer_name: string; congregation_name: string; vehicle_name?: string })[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCong, setFilterCong] = useState('')
  const [filterAction, setFilterAction] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)

    let cQuery = supabase.from('congregations').select('*').order('name')
    if (!isAdminGeneral && congregationIds.length > 0) cQuery = cQuery.in('id', congregationIds)
    const { data: congs } = await cQuery
    setCongregations(congs ?? [])

    const congIds = (congs ?? []).map(c => c.id)
    if (congIds.length === 0) { setLogs([]); setLoading(false); return }

    const { data: rawLogs } = await supabase
      .from('audit_logs')
      .select('*')
      .in('congregation_id', congIds)
      .order('created_at', { ascending: false })
      .limit(500)

    if (!rawLogs || rawLogs.length === 0) { setLogs([]); setLoading(false); return }

    const performerIds = [...new Set(rawLogs.map(l => l.performed_by))]
    const vehicleIds = [...new Set(rawLogs.filter(l => l.vehicle_id).map(l => l.vehicle_id))]

    const [{ data: profiles }, { data: vehicles }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', performerIds),
      vehicleIds.length > 0
        ? supabase.from('vehicles').select('id, name').in('id', vehicleIds)
        : Promise.resolve({ data: [] }),
    ])

    setLogs(rawLogs.map(l => ({
      ...l,
      performer_name: (profiles ?? []).find(p => p.id === l.performed_by)?.full_name ?? 'Usuário desconhecido',
      congregation_name: (congs ?? []).find(c => c.id === l.congregation_id)?.name ?? '',
      vehicle_name: (vehicles ?? []).find(v => v.id === l.vehicle_id)?.name,
    })))
    setLoading(false)
  }

  const filtered = logs.filter(l => {
    const matchSearch = !search ||
      l.description.toLowerCase().includes(search.toLowerCase()) ||
      l.performer_name.toLowerCase().includes(search.toLowerCase()) ||
      (l.vehicle_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCong = !filterCong || l.congregation_id === filterCong
    const matchAction = !filterAction || l.action_type === filterAction
    return matchSearch && matchCong && matchAction
  })

  const uniqueActions = [...new Set(logs.map(l => l.action_type))]

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Auditoria"
        subtitle="Histórico completo de ações no sistema"
        icon={<Shield className="w-6 h-6" />}
      />

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Pesquisar por descrição, usuário ou veículo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          {isAdminGeneral && (
            <Select
              options={[{ value: '', label: 'Todas congregações' }, ...congregations.map(c => ({ value: c.id, label: c.name }))]}
              value={filterCong}
              onChange={e => setFilterCong(e.target.value)}
              className="sm:w-52"
            />
          )}
          <Select
            options={[
              { value: '', label: 'Todas as ações' },
              ...uniqueActions.map(a => ({ value: a, label: ACTION_LABELS[a]?.label ?? a }))
            ]}
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="sm:w-52"
          />
        </div>

        {loading ? (
          <Spinner className="py-10" label="Carregando histórico..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-stone-100 dark:divide-stone-700">
            {filtered.map(log => {
              const meta = ACTION_LABELS[log.action_type]
              const date = new Date(log.created_at)
              const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
              return (
                <div key={log.id} className="py-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <Badge variant={meta?.variant ?? 'neutral'}>
                      {meta?.label ?? log.action_type}
                    </Badge>
                    <span className="text-xs text-stone-400 flex-shrink-0">{dateStr} {timeStr}</span>
                  </div>
                  <p className="text-sm text-stone-700 dark:text-stone-200 leading-snug">{log.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-medium text-stone-500">{log.performer_name}</span>
                    {isAdminGeneral && log.congregation_name && (
                      <span className="text-xs text-stone-400 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded-md">{log.congregation_name}</span>
                    )}
                    {log.vehicle_name && (
                      <span className="text-xs text-stone-400 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded-md">{log.vehicle_name}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && (
          <p className="text-xs text-stone-400 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </Card>
    </div>
  )
}
