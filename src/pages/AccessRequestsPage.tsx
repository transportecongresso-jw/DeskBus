import { useEffect, useState } from 'react'
import { ClipboardList, Check, X, Clock, Building2, Phone, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
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
  phone: string | null
  notes: string | null
  password_temp: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export function AccessRequestsPage() {
  const { user } = useAuth()
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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: reqs }, { data: congs }] = await Promise.all([
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('congregations').select('*').order('name'),
    ])
    setRequests(reqs ?? [])
    setCongregations(congs ?? [])
    setLoading(false)
  }

  async function handleApprove() {
    if (!approveModal || !selectedCongId) {
      toast.error('Selecione a congregação')
      return
    }
    if (!SERVICE_ROLE_KEY) {
      toast.error('Chave de serviço não configurada. Verifique as variáveis de ambiente.')
      return
    }
    setApproving(true)
    try {
      // Create user in Supabase Auth with the password they set — no email confirmation
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          email: approveModal.email,
          password: approveModal.password_temp,
          email_confirm: true,
          user_metadata: { full_name: approveModal.full_name },
        }),
      })
      const userData = await res.json()
      if (!res.ok) {
        throw new Error(userData.message ?? 'Erro ao criar usuário')
      }

      const userId = userData.id

      // Update profile: set name, phone, role
      await supabase.from('profiles').update({
        full_name: approveModal.full_name,
        phone: approveModal.phone || null,
        role: selectedRole,
      }).eq('id', userId)

      // Link to congregation
      await supabase.from('congregation_admins').insert({
        user_id: userId,
        congregation_id: selectedCongId,
      })

      // Mark request approved and clear password
      await supabase.from('access_requests').update({
        status: 'approved',
        password_temp: null,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', approveModal.id)

      await logAction({
        congregationId: selectedCongId,
        actionType: 'access_request_approved',
        description: `Solicitação de "${approveModal.full_name}" (${approveModal.email}) aprovada como ${selectedRole === 'admin_general' ? 'SuperAdmin' : 'Admin. Congregação'}`,
        performedBy: user!.id,
      })

      toast.success(`Acesso criado para ${approveModal.email}`)
      setApproveModal(null)
      setSelectedCongId('')
      setSelectedRole('admin_congregation')
      loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao aprovar solicitação')
    } finally {
      setApproving(false)
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
        subtitle="Gerencie pedidos de acesso ao sistema"
        icon={<ClipboardList className="w-6 h-6" />}
        actions={
          <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={loadData}>
            Atualizar
          </Button>
        }
      />

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
            {filtered.map(req => (
              <div key={req.id} className="py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <p className="font-semibold text-stone-800 dark:text-stone-100">{req.full_name}</p>
                      {statusBadge(req.status)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{req.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                        <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{req.congregation_name}</span>
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
                    </div>
                    <p className="text-xs text-stone-400 mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(req.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        icon={<Check className="w-4 h-4" />}
                        onClick={() => { setApproveModal(req); setSelectedCongId(''); setSelectedRole('admin_congregation') }}
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
            ))}
          </div>
        )}
      </Card>

      {/* Approve Modal */}
      <Modal
        open={!!approveModal}
        onClose={() => { setApproveModal(null); setSelectedCongId('') }}
        title="Aprovar Solicitação"
        size="sm"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setApproveModal(null); setSelectedCongId('') }} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              loading={approving}
              disabled={!selectedCongId}
              className="flex-1"
              icon={<ShieldCheck className="w-4 h-4" />}
            >
              Aprovar
            </Button>
          </div>
        }
      >
        {approveModal && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-stone-50 dark:bg-stone-700/50 rounded-xl">
              <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">{approveModal.full_name}</p>
              <p className="text-xs text-stone-500 mt-0.5">{approveModal.email}</p>
              <p className="text-xs text-stone-400 mt-0.5">Congregação solicitada: {approveModal.congregation_name}</p>
            </div>

            <Select
              label="Vincular à Congregação *"
              value={selectedCongId}
              onChange={e => setSelectedCongId(e.target.value)}
              options={[
                { value: '', label: 'Selecione a congregação...' },
                ...congregations.map(c => ({ value: c.id, label: `${c.name}${c.city ? ` · ${c.city}` : ''}` })),
              ]}
            />

            <Select
              label="Perfil de Acesso"
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              options={[
                { value: 'admin_congregation', label: 'Administrador de Congregação' },
              ]}
            />

            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                O usuário será criado imediatamente. Poderá acessar o sistema com o e-mail e a senha que ele mesmo definiu na solicitação.
              </p>
            </div>
          </div>
        )}
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
    </div>
  )
}
