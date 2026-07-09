import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Check, X, Clock, Building2, Phone, Mail, RefreshCw, ShieldCheck, Anchor, Info, ChevronDown, Search, UserCheck, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { logAction } from '../lib/audit'
import { playSound } from '../lib/sounds'
import toast from 'react-hot-toast'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

function adminHeaders() {
  return {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
  }
}

interface AccessRequest {
  id: string
  full_name: string
  email: string
  congregation_name: string
  congregation_id: string | null
  requested_role: string | null
  phone: string | null
  notes: string | null
  password_temp: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

function roleLabel(role: string | null) {
  if (role === 'captain') return 'Capitão'
  return 'Adm. Congregação'
}

function roleBadge(role: string | null) {
  if (role === 'captain') return <Badge variant="neutral"><Anchor className="w-3 h-3 mr-1" />Capitão</Badge>
  return <Badge variant="info">Adm. Congregação</Badge>
}

export function AccessRequestsPage() {
  const { user, isAdminGeneral, congregationIds } = useAuth()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [approveModal, setApproveModal] = useState<AccessRequest | null>(null)
  const [rejectModal, setRejectModal] = useState<AccessRequest | null>(null)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [selectedCongId, setSelectedCongId] = useState('')
  const [selectedRole, setSelectedRole] = useState('admin_congregation')
  const [rejectionReason, setRejectionReason] = useState('')

  // Post-approval: optional passenger link for captains
  const [linkPassengerModal, setLinkPassengerModal] = useState<{
    captainUserId: string
    captainName: string
    congregationId: string
  } | null>(null)
  const [passLinkSearch, setPassLinkSearch] = useState('')
  const [passLinkResults, setPassLinkResults] = useState<{ id: string; full_name: string }[]>([])
  const [passLinkLoading, setPassLinkLoading] = useState(false)
  const [passLinkSaving, setPassLinkSaving] = useState(false)
  const passLinkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadData() }, [congregationIds, isAdminGeneral])

  async function loadData() {
    setLoading(true)
    const [{ data: reqs }, { data: congs }] = await Promise.all([
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('congregations').select('*').order('name'),
    ])
    setCongregations(congs ?? [])

    // Congregation admins only see requests from their own congregations
    const allReqs = reqs ?? []
    if (isAdminGeneral) {
      setRequests(allReqs)
    } else {
      setRequests(allReqs.filter(r => r.congregation_id && congregationIds.includes(r.congregation_id)))
    }
    setLoading(false)
  }

  // Whether the current user can approve a given request
  function canApprove(req: AccessRequest): boolean {
    if (isAdminGeneral) return true
    // Congregation admins can only approve captain requests for their congregations
    if (req.requested_role === 'captain' && req.congregation_id && congregationIds.includes(req.congregation_id)) return true
    return false
  }

  async function handleApprove() {
    if (!approveModal) return
    const congId = selectedCongId || approveModal.congregation_id || ''
    if (!congId) { toast.error('Selecione a congregação'); return }
    if (!SERVICE_ROLE_KEY) { toast.error('Chave de serviço não configurada.'); return }

    setApproving(true)
    try {
      const role = isAdminGeneral ? selectedRole : (approveModal.requested_role ?? 'captain')

      // Pass role + full_name in user_metadata so the handle_new_user trigger
      // creates the profile with the correct role automatically (SECURITY DEFINER,
      // bypasses RLS). This ensures even congregation-admin approvals set the role.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          email: approveModal.email,
          password: approveModal.password_temp,
          email_confirm: true,
          user_metadata: {
            full_name: approveModal.full_name,
            role,
          },
        }),
      })
      const userData = await res.json()

      let userId: string
      if (!res.ok) {
        const errCode = userData.error_code ?? ''
        // Email já existe: busca o usuário existente e reaproveita
        if (errCode === 'email_exists' || res.status === 422) {
          const listRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(approveModal.email)}`,
            { headers: adminHeaders() }
          )
          const listData = await listRes.json()
          const existing = listData?.users?.[0]
          if (!existing) throw new Error(userData.msg ?? userData.message ?? 'Email já cadastrado — usuário não encontrado')
          userId = existing.id
        } else {
          throw new Error(userData.msg ?? userData.message ?? 'Erro ao criar usuário')
        }
      } else {
        userId = userData.id
      }

      // Best-effort profile update (phone + extra fields). Role is already set by trigger.
      // May be a no-op for congregation admins due to RLS, but that's fine — role is correct.
      await supabase.from('profiles').update({
        full_name: approveModal.full_name,
        phone: approveModal.phone || null,
        role,
      }).eq('id', userId)

      const { error: caError } = await supabase
        .rpc('link_user_to_congregation', { p_user_id: userId, p_congregation_id: congId })
      if (caError) throw new Error(`Erro ao vincular congregação: ${caError.message}`)

      await supabase.from('access_requests').update({
        status: 'approved',
        password_temp: null,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', approveModal.id)

      await logAction({
        congregationId: congId,
        actionType: 'access_request_approved',
        description: `Solicitação de "${approveModal.full_name}" (${approveModal.email}) aprovada como ${roleLabel(role)}`,
        performedBy: user!.id,
      })

      playSound('success')
      toast.success(`Acesso criado para ${approveModal.email}`)
      setApproveModal(null)
      setSelectedCongId('')
      setSelectedRole('admin_congregation')
      loadData()

      // For captains, optionally link to a passenger
      if (role === 'captain') {
        setPassLinkSearch('')
        setPassLinkResults([])
        setLinkPassengerModal({ captainUserId: userId, captainName: approveModal.full_name, congregationId: congId })
      }
    } catch (err: any) {
      playSound('error')
      toast.error(err.message ?? 'Erro ao aprovar solicitação')
    } finally {
      setApproving(false)
    }
  }

  function handlePassLinkSearch(query: string, congregationId: string) {
    setPassLinkSearch(query)
    if (passLinkTimeoutRef.current) clearTimeout(passLinkTimeoutRef.current)
    if (query.length < 2) { setPassLinkResults([]); return }
    setPassLinkLoading(true)
    passLinkTimeoutRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('passengers')
        .select('id, full_name')
        .eq('congregation_id', congregationId)
        .ilike('full_name', `%${query}%`)
        .order('full_name')
        .limit(8)
      setPassLinkResults(data ?? [])
      setPassLinkLoading(false)
    }, 300)
  }

  async function handlePassLinkSave(passenger: { id: string; full_name: string }) {
    if (!linkPassengerModal) return
    setPassLinkSaving(true)
    try {
      const { error } = await supabase
        .from('captain_passenger_links')
        .upsert({
          captain_id: linkPassengerModal.captainUserId,
          passenger_id: passenger.id,
          congregation_id: linkPassengerModal.congregationId,
          linked_by: user?.id,
        }, { onConflict: 'captain_id' })
      if (error) throw error
      toast.success(`Capitão vinculado a ${passenger.full_name}`)
      setLinkPassengerModal(null)
    } catch {
      toast.error('Erro ao vincular passageiro')
    } finally {
      setPassLinkSaving(false)
    }
  }

  async function handleReject() {
    if (!rejectModal) return
    setRejecting(true)
    try {
      await supabase.from('access_requests').update({
        status: 'rejected',
        rejection_reason: rejectionReason.trim() || null,
        password_temp: null,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', rejectModal.id)

      playSound('error')
      toast.success('Solicitação rejeitada')
      setRejectModal(null)
      setRejectionReason('')
      loadData()
    } catch {
      toast.error('Erro ao rejeitar solicitação')
    } finally {
      setRejecting(false)
    }
  }

  const filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  function statusBadge(status: AccessRequest['status']) {
    if (status === 'pending') return <Badge variant="warning" dot>Pendente</Badge>
    if (status === 'approved') return <Badge variant="success" dot>Aprovada</Badge>
    return <Badge variant="danger" dot>Rejeitada</Badge>
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Solicitações de Acesso"
        subtitle={isAdminGeneral ? 'Gerencie pedidos de acesso ao sistema' : 'Pedidos de acesso para sua congregação'}
        icon={<ClipboardList className="w-6 h-6" />}
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
            Atualizar
          </Button>
        }
      />

      {/* Info banner for congregation admins */}
      {!isAdminGeneral && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            Você pode aprovar ou rejeitar solicitações de <strong>Capitão</strong> para sua congregação.
            Solicitações de <strong>Administrador</strong> são aprovadas exclusivamente pelo SuperAdmin.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {([
          ['pending', 'Pendentes', pendingCount],
          ['approved', 'Aprovadas', requests.filter(r => r.status === 'approved').length],
          ['rejected', 'Rejeitadas', requests.filter(r => r.status === 'rejected').length],
          ['all', 'Todas', requests.length],
        ] as const).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setFilterStatus(val)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              filterStatus === val
                ? 'bg-amber-400 text-amber-950'
                : 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-500'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterStatus === val ? 'bg-amber-300/50' : 'bg-stone-100 dark:bg-stone-700'}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <Spinner className="py-10" label="Carregando solicitações..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {filterStatus === 'pending' ? 'Nenhuma solicitação pendente' : 'Nenhuma solicitação encontrada'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-stone-100 dark:divide-stone-700">
            {filtered.map(req => {
              const approvable = canApprove(req)
              return (
                <div key={req.id} className="py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <p className="font-semibold text-stone-800 dark:text-stone-100">{req.full_name}</p>
                        {statusBadge(req.status)}
                        {roleBadge(req.requested_role)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{req.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{req.congregation_name || '—'}</span>
                        </div>
                        {req.phone && (
                          <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>{req.phone}</span>
                          </div>
                        )}
                        {req.rejection_reason && (
                          <div className="mt-1 px-2 py-1.5 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-xs text-rose-600 dark:text-rose-400">
                            Motivo: {req.rejection_reason}
                          </div>
                        )}
                        {/* Congregation admins: view-only notice for admin requests */}
                        {!isAdminGeneral && req.requested_role !== 'captain' && req.status === 'pending' && (
                          <div className="mt-1 px-2 py-1.5 bg-stone-50 dark:bg-stone-700 rounded-lg text-xs text-stone-500">
                            Aprovação exclusiva do SuperAdmin
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-stone-400 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(req.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>

                    {req.status === 'pending' && approvable && (
                      <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        <Button
                          size="sm"
                          icon={<Check className="w-4 h-4" />}
                          onClick={() => {
                            setApproveModal(req)
                            setSelectedCongId(req.congregation_id ?? '')
                            setSelectedRole(req.requested_role ?? 'admin_congregation')
                          }}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<X className="w-4 h-4" />}
                          onClick={() => { setRejectModal(req); setRejectionReason('') }}
                        >
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Approve Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => { setApproveModal(null); setSelectedCongId('') }}
        title="Confirmar Aprovação"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setApproveModal(null); setSelectedCongId('') }} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              loading={approving}
              disabled={!selectedCongId && !approveModal?.congregation_id}
              className="flex-1"
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Aprovar
            </Button>
          </div>
        }
      >
        {approveModal && (() => {
          const effectiveCongId = selectedCongId || approveModal.congregation_id || ''
          const effectiveCong = congregations.find(c => c.id === effectiveCongId)
          const congDisplayName = effectiveCong
            ? `${effectiveCong.name}${effectiveCong.city ? ` — ${effectiveCong.city}` : ''}`
            : approveModal.congregation_name || '—'
          const effectiveRole = selectedRole || approveModal.requested_role || 'admin_congregation'

          return (
            <div className="flex flex-col gap-4">
              {/* Summary — what will be created */}
              <div className="p-4 bg-stone-50 dark:bg-stone-700/50 rounded-xl space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-stone-800 dark:text-stone-100">{approveModal.full_name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{approveModal.email}</p>
                  </div>
                  {roleBadge(effectiveRole)}
                </div>
                {approveModal.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {approveModal.phone}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
                  <Building2 className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                  <span className="font-medium">{congDisplayName}</span>
                  {selectedCongId && selectedCongId !== approveModal.congregation_id && (
                    <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] rounded-full font-medium">
                      corrigida
                    </span>
                  )}
                </div>
              </div>

              {/* Optional correction — SuperAdmin only */}
              {isAdminGeneral && (
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer list-none px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-700/50 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                      Corrigir congregação ou perfil
                    </span>
                    <ChevronDown className="w-4 h-4 text-stone-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 flex flex-col gap-3 px-1">
                    {/* Congregation selector — pre-filled with user's choice */}
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Congregação</label>
                      <select
                        value={selectedCongId}
                        onChange={e => setSelectedCongId(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {!approveModal.congregation_id && (
                          <option value="">Selecione a congregação...</option>
                        )}
                        {congregations.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.city ? ` — ${c.city}` : ''}
                            {c.id === approveModal.congregation_id ? ' (selecionada pelo usuário)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Role selector — pre-filled with requested role */}
                    <Select
                      label="Perfil de Acesso"
                      value={selectedRole}
                      onChange={e => setSelectedRole(e.target.value)}
                      options={[
                        { value: 'admin_congregation', label: 'Administrador de Congregação' },
                        { value: 'captain', label: 'Capitão' },
                      ]}
                    />
                  </div>
                </details>
              )}

              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
                <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  O usuário será criado e vinculado automaticamente à congregação e ao perfil acima.
                </p>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={!!rejectModal}
        onClose={() => { setRejectModal(null); setRejectionReason('') }}
        title="Rejeitar Solicitação"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setRejectModal(null); setRejectionReason('') }} className="flex-1">
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleReject} loading={rejecting} className="flex-1" icon={<X className="w-4 h-4" />}>
              Rejeitar
            </Button>
          </div>
        }
      >
        {rejectModal && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{rejectModal.full_name}</p>
              <p className="text-xs text-stone-500 mt-0.5">{rejectModal.email}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Motivo da rejeição (opcional)</label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Informe o motivo para registrar..."
                className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Optional: link captain to passenger after approval */}
      <Modal
        open={!!linkPassengerModal}
        onClose={() => setLinkPassengerModal(null)}
        title="Vincular Passageiro (Opcional)"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLinkPassengerModal(null)} className="flex-1">
              Fazer depois
            </Button>
          </div>
        }
      >
        {linkPassengerModal && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
              <Anchor className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{linkPassengerModal.captainName}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  O capitão também ocupa um assento como passageiro. Vincule-o para que apareça identificado no veículo.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                <input
                  value={passLinkSearch}
                  onChange={e => handlePassLinkSearch(e.target.value, linkPassengerModal.congregationId)}
                  placeholder="Comece a digitar o nome do passageiro..."
                  autoFocus
                  className="w-full pl-8 pr-4 py-2.5 text-sm rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {passLinkLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size="sm" /></div>
                )}
              </div>

              {passLinkResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl z-10 overflow-hidden">
                  {passLinkResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handlePassLinkSave(p)}
                      disabled={passLinkSaving}
                      className="w-full text-left px-4 py-2.5 text-sm text-stone-700 dark:text-stone-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
                      {p.full_name}
                    </button>
                  ))}
                </div>
              )}

              {passLinkSearch.length >= 2 && !passLinkLoading && passLinkResults.length === 0 && (
                <p className="text-xs text-stone-400 mt-2 pl-1">Nenhum passageiro encontrado para "{passLinkSearch}"</p>
              )}
              {passLinkSearch.length < 2 && passLinkSearch.length > 0 && (
                <p className="text-xs text-stone-400 mt-2 pl-1">Continue digitando para pesquisar...</p>
              )}
            </div>

            <p className="text-xs text-stone-400 text-center">
              Isso pode ser feito depois na tela de Capitães.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
