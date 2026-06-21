import { useEffect, useState } from 'react'
import {
  UserCog, Plus, Pencil, Trash2, Search, Link2, Eye, EyeOff,
  RefreshCw, ShieldOff, ShieldCheck, Filter, Phone, Mail, Clock
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Profile, Congregation } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Spinner } from '../components/ui/Spinner'
import toast from 'react-hot-toast'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

interface AuthUser {
  id: string
  email: string
  last_sign_in_at: string | null
  banned_until: string | null
}

interface UserWithContext extends Profile {
  congregations: Congregation[]
  last_sign_in_at: string | null
  is_disabled: boolean
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: SERVICE_ROLE_KEY,
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

async function logAudit(congregationId: string, actionType: string, description: string, performedBy: string) {
  await supabase.from('audit_logs').insert({
    congregation_id: congregationId,
    action_type: actionType,
    description,
    performed_by: performedBy,
  })
}

export function UsersPage() {
  const { isAdminGeneral, user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserWithContext[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'admin_general' | 'admin_congregation'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all')
  const [filterCong, setFilterCong] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserWithContext | null>(null)
  const [deleting, setDeleting] = useState<UserWithContext | null>(null)
  const [toggling, setToggling] = useState<UserWithContext | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState<UserWithContext | null>(null)

  useEffect(() => { if (isAdminGeneral) loadData() }, [isAdminGeneral])

  async function loadData() {
    setLoading(true)
    try {
      const [{ data: profiles }, { data: congs }] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('congregations').select('*').order('name'),
      ])
      setCongregations(congs ?? [])

      const [{ data: links }, authRes] = await Promise.all([
        supabase.from('congregation_admins').select('*'),
        SERVICE_ROLE_KEY
          ? fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders() }).then(r => r.json())
          : Promise.resolve({ users: [] }),
      ])

      const authMap = new Map<string, AuthUser>(
        (authRes?.users ?? []).map((u: AuthUser) => [u.id, u])
      )

      const withContext: UserWithContext[] = (profiles ?? []).map(p => {
        const auth = authMap.get(p.id)
        const bannedUntil = auth?.banned_until
        const isBanned = !!bannedUntil && new Date(bannedUntil) > new Date()
        return {
          ...p,
          congregations: (links ?? [])
            .filter((l: any) => l.user_id === p.id)
            .map((l: any) => (congs ?? []).find(c => c.id === l.congregation_id))
            .filter(Boolean) as Congregation[],
          last_sign_in_at: auth?.last_sign_in_at ?? null,
          is_disabled: isBanned,
        }
      })

      setUsers(withContext)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleting || !SERVICE_ROLE_KEY) return
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${deleting.id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    if (!res.ok) { toast.error('Erro ao excluir usuário'); return }
    toast.success('Usuário excluído')
    setDeleting(null)
    loadData()
  }

  async function handleToggleDisable() {
    if (!toggling || !SERVICE_ROLE_KEY) return
    const willDisable = !toggling.is_disabled
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${toggling.id}`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ ban_duration: willDisable ? '87600h' : 'none' }),
    })
    if (!res.ok) { toast.error('Erro ao alterar status'); return }

    for (const cong of toggling.congregations) {
      await logAudit(
        cong.id,
        willDisable ? 'user_disabled' : 'user_enabled',
        `Usuário "${toggling.full_name}" ${willDisable ? 'desativado' : 'reativado'}`,
        currentUser!.id
      )
    }

    toast.success(willDisable ? 'Usuário desativado' : 'Usuário reativado')
    setToggling(null)
    loadData()
  }

  const filtered = users.filter(u => {
    if (search && !u.full_name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterRole !== 'all' && u.role !== filterRole) return false
    if (filterStatus === 'active' && u.is_disabled) return false
    if (filterStatus === 'disabled' && !u.is_disabled) return false
    if (filterCong !== 'all' && !u.congregations.some(c => c.id === filterCong)) return false
    return true
  })

  if (!isAdminGeneral) return null

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Usuários"
        subtitle={`${users.length} usuário${users.length !== 1 ? 's' : ''} cadastrado${users.length !== 1 ? 's' : ''}`}
        icon={<UserCog className="w-6 h-6" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" icon={<Filter className="w-4 h-4" />} onClick={() => setShowFilters(s => !s)}>
              Filtros
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
              Novo Usuário
            </Button>
          </div>
        }
      />

      {showFilters && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Tipo"
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as any)}
              options={[
                { value: 'all', label: 'Todos os tipos' },
                { value: 'admin_general', label: 'SuperAdmin' },
                { value: 'admin_congregation', label: 'Admin Congregação' },
              ]}
            />
            <Select
              label="Status"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              options={[
                { value: 'all', label: 'Todos os status' },
                { value: 'active', label: 'Ativos' },
                { value: 'disabled', label: 'Desativados' },
              ]}
            />
            <Select
              label="Congregação"
              value={filterCong}
              onChange={e => setFilterCong(e.target.value)}
              options={[
                { value: 'all', label: 'Todas as congregações' },
                ...congregations.map(c => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-4">
          <Input
            placeholder="Pesquisar por nome ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {loading ? (
          <Spinner className="py-10" label="Carregando usuários..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-stone-400">
            <UserCog className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-stone-100 dark:divide-stone-700">
            {filtered.map(u => (
              <div key={u.id} className={`py-3 flex items-start gap-3 ${u.is_disabled ? 'opacity-60' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  u.is_disabled ? 'bg-stone-200 dark:bg-stone-700' : 'bg-amber-100 dark:bg-amber-900/30'
                }`}>
                  <span className={`text-sm font-bold ${u.is_disabled ? 'text-stone-400' : 'text-amber-700'}`}>
                    {u.full_name?.charAt(0) ?? '?'}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-stone-800 dark:text-stone-100 text-sm">{u.full_name}</p>
                    {u.id === currentUser?.id && <Badge variant="info">Você</Badge>}
                    {u.role === 'admin_general' ? (
                      <Badge variant="warning">SuperAdmin</Badge>
                    ) : (
                      <Badge variant="neutral">Admin Congregação</Badge>
                    )}
                    {u.is_disabled && <Badge variant="danger">Desativado</Badge>}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-stone-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" />{u.email}
                    </span>
                    {u.phone && (
                      <span className="text-xs text-stone-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" />{u.phone}
                      </span>
                    )}
                    <span className="text-xs text-stone-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {u.last_sign_in_at ? `Último acesso ${formatDate(u.last_sign_in_at)}` : 'Nunca acessou'}
                    </span>
                  </div>

                  {u.congregations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {u.congregations.map(c => (
                        <span key={c.id} className="text-[11px] bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-2 py-0.5 rounded-full">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}
                    onClick={() => setShowPasswordModal(u)} title="Redefinir senha" />
                  <Button variant="ghost" size="sm" icon={<Pencil className="w-3.5 h-3.5" />}
                    onClick={() => { setEditing(u); setShowForm(true) }} title="Editar" />
                  {u.id !== currentUser?.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={u.is_disabled
                          ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          : <ShieldOff className="w-3.5 h-3.5 text-amber-500" />
                        }
                        onClick={() => setToggling(u)}
                        title={u.is_disabled ? 'Reativar' : 'Desativar'}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        onClick={() => setDeleting(u)}
                        title="Excluir"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-stone-400 mt-4 text-right">
          {filtered.length} de {users.length} usuário{users.length !== 1 ? 's' : ''}
        </p>
      </Card>

      <UserForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        congregations={congregations}
        onSaved={() => { setShowForm(false); loadData() }}
      />

      <PasswordModal
        open={!!showPasswordModal}
        user={showPasswordModal}
        onClose={() => setShowPasswordModal(null)}
      />

      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={handleToggleDisable}
        variant={toggling?.is_disabled ? 'warning' : 'danger'}
        title={toggling?.is_disabled ? 'Reativar Usuário' : 'Desativar Usuário'}
        message={toggling?.is_disabled
          ? `Reativar "${toggling?.full_name}"? Ele voltará a ter acesso ao sistema.`
          : `Desativar "${toggling?.full_name}"? Ele perderá o acesso imediatamente, mas seus dados serão mantidos.`
        }
        confirmLabel={toggling?.is_disabled ? 'Reativar' : 'Desativar'}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Excluir Usuário"
        message={`Excluir permanentemente "${deleting?.full_name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
      />
    </div>
  )
}

// --- UserForm ---
function UserForm({ open, onClose, editing, congregations, onSaved }: {
  open: boolean; onClose: () => void; editing: UserWithContext | null
  congregations: Congregation[]; onSaved: () => void
}) {
  const { user: currentUser } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<'admin_general' | 'admin_congregation'>('admin_congregation')
  const [selectedCongs, setSelectedCongs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFullName(editing?.full_name ?? '')
    setEmail(editing?.email ?? '')
    setPhone(editing?.phone ?? '')
    setPassword('')
    setRole((editing?.role as any) ?? 'admin_congregation')
    setSelectedCongs(editing?.congregations.map(c => c.id) ?? [])
  }, [editing, open])

  function toggleCong(id: string) {
    setSelectedCongs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!SERVICE_ROLE_KEY) { toast.error('Service role key não configurada'); return }
    if (!editing && password.length < 8) { toast.error('Senha deve ter no mínimo 8 caracteres'); return }
    if (role === 'admin_congregation' && selectedCongs.length === 0) {
      toast.error('Selecione ao menos uma congregação'); return
    }
    setLoading(true)
    try {
      if (editing) {
        const { error } = await supabase.from('profiles').update({
          full_name: fullName,
          phone: phone || null,
          role,
        }).eq('id', editing.id)
        if (error) throw error

        await supabase.from('congregation_admins').delete().eq('user_id', editing.id)
        if (role === 'admin_congregation' && selectedCongs.length > 0) {
          await supabase.from('congregation_admins').insert(
            selectedCongs.map(cid => ({ user_id: editing.id, congregation_id: cid }))
          )
        }
        for (const cid of selectedCongs) {
          await logAudit(cid, 'user_edited', `Usuário "${fullName}" editado`, currentUser!.id)
        }
        toast.success('Usuário atualizado')
      } else {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          }),
        })
        const userData = await res.json()
        if (!res.ok) throw new Error(userData.message ?? 'Erro ao criar usuário')

        const userId = userData.id
        await supabase.from('profiles').update({
          full_name: fullName,
          phone: phone || null,
          role,
        }).eq('id', userId)

        if (role === 'admin_congregation' && selectedCongs.length > 0) {
          await supabase.from('congregation_admins').insert(
            selectedCongs.map(cid => ({ user_id: userId, congregation_id: cid }))
          )
          for (const cid of selectedCongs) {
            await logAudit(cid, 'user_created', `Usuário "${fullName}" (${email}) criado`, currentUser!.id)
          }
        }
        toast.success('Usuário criado com sucesso!')
      }
      onSaved()
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao salvar usuário')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Usuário' : 'Novo Usuário'} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome Completo" value={fullName} onChange={e => setFullName(e.target.value)} required />
        <Input label="Telefone (opcional)" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="(00) 00000-0000" />

        {!editing && (
          <>
            <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <div className="relative">
              <Input
                label="Senha Inicial"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                hint="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-9 text-stone-400 hover:text-stone-600 transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}

        <Select
          label="Tipo de Acesso"
          value={role}
          onChange={e => setRole(e.target.value as any)}
          options={[
            { value: 'admin_congregation', label: 'Administrador de Congregação' },
            { value: 'admin_general', label: 'SuperAdmin (Administrador Geral)' },
          ]}
        />

        {role === 'admin_congregation' && (
          <div>
            <p className="text-sm font-medium text-stone-700 dark:text-stone-200 mb-2 flex items-center gap-1.5">
              <Link2 className="w-4 h-4 text-amber-500" /> Congregações vinculadas
            </p>
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 p-1">
              {congregations.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCong(c.id)}
                  className={`text-left w-full px-3 py-2.5 rounded-xl border-2 text-sm transition-all ${
                    selectedCongs.includes(c.id)
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'
                      : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:border-stone-300'
                  }`}
                >
                  <span className="mr-2">{selectedCongs.includes(c.id) ? '✓' : '○'}</span>
                  {c.name} {c.city && <span className="text-stone-400">· {c.city}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">{editing ? 'Salvar' : 'Criar Usuário'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// --- PasswordModal ---
function PasswordModal({ open, user, onClose }: { open: boolean; user: UserWithContext | null; onClose: () => void }) {
  const { user: currentUser } = useAuth()
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { setPassword(''); setShowPw(false) }, [open])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !SERVICE_ROLE_KEY) return
    if (password.length < 8) { toast.error('Senha deve ter no mínimo 8 caracteres'); return }
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error()
      for (const cong of user.congregations) {
        await logAudit(cong.id, 'password_reset', `Senha de "${user.full_name}" redefinida`, currentUser!.id)
      }
      toast.success('Senha redefinida com sucesso')
      onClose()
    } catch {
      toast.error('Erro ao redefinir senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Redefinir Senha" size="sm">
      <form onSubmit={handleReset} className="flex flex-col gap-4">
        <p className="text-sm text-stone-500">
          Nova senha para <strong className="text-stone-800 dark:text-stone-200">{user?.full_name}</strong>
        </p>
        <div className="relative">
          <Input
            label="Nova Senha"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            hint="Mínimo 8 caracteres"
          />
          <button
            type="button"
            onClick={() => setShowPw(s => !s)}
            className="absolute right-3 top-9 text-stone-400 hover:text-stone-600 transition-colors"
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">Redefinir</Button>
        </div>
      </form>
    </Modal>
  )
}
