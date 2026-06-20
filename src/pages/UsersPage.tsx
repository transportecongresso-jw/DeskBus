import { useEffect, useState } from 'react'
import { UserCog, Plus, Pencil, Trash2, Search, Link2, X, Eye, EyeOff, RefreshCw } from 'lucide-react'
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

interface UserWithCongs extends Profile {
  congregations: Congregation[]
}

export function UsersPage() {
  const { isAdminGeneral, user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserWithCongs[]>([])
  const [congregations, setCongregations] = useState<Congregation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserWithCongs | null>(null)
  const [deleting, setDeleting] = useState<UserWithCongs | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState<UserWithCongs | null>(null)

  useEffect(() => { if (isAdminGeneral) loadData() }, [isAdminGeneral])

  async function loadData() {
    setLoading(true)
    const [{ data: profiles }, { data: congs }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('congregations').select('*').order('name'),
    ])
    setCongregations(congs ?? [])

    const { data: links } = await supabase.from('congregation_admins').select('*')

    const withCongs: UserWithCongs[] = (profiles ?? []).map(p => ({
      ...p,
      congregations: (links ?? [])
        .filter(l => l.user_id === p.id)
        .map(l => (congs ?? []).find(c => c.id === l.congregation_id))
        .filter(Boolean) as Congregation[],
    }))

    setUsers(withCongs)
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleting || !SERVICE_ROLE_KEY) return
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${deleting.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      })
      toast.success('Usuário removido')
      setDeleting(null)
      loadData()
    } catch {
      toast.error('Erro ao remover usuário')
    }
  }

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  if (!isAdminGeneral) return null

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie os administradores do sistema"
        icon={<UserCog className="w-6 h-6" />}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
            Novo Usuário
          </Button>
        }
      />

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
              <div key={u.id} className="py-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-amber-700">{u.full_name?.charAt(0) ?? '?'}</span>
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
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">{u.email}</p>
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
                    onClick={() => { setEditing(u); setShowForm(true) }} />
                  {u.id !== currentUser?.id && (
                    <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />}
                      className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      onClick={() => setDeleting(u)} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Remover Usuário"
        message={`Remover "${deleting?.full_name}"? Ele perderá acesso ao sistema imediatamente.`}
      />
    </div>
  )
}

// --- UserForm ---
function UserForm({ open, onClose, editing, congregations, onSaved }: {
  open: boolean; onClose: () => void; editing: UserWithCongs | null
  congregations: Congregation[]; onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<'admin_general' | 'admin_congregation'>('admin_congregation')
  const [selectedCongs, setSelectedCongs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setFullName(editing?.full_name ?? '')
    setEmail(editing?.email ?? '')
    setPassword('')
    setRole((editing?.role as any) ?? 'admin_congregation')
    setSelectedCongs(editing?.congregations.map(c => c.id) ?? [])
  }, [editing, open])

  function toggleCong(id: string) {
    setSelectedCongs(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!SERVICE_ROLE_KEY) {
      toast.error('Service role key não configurada')
      return
    }
    setLoading(true)
    try {
      if (editing) {
        // Update profile
        const { error } = await supabase.from('profiles').update({ full_name: fullName, role }).eq('id', editing.id)
        if (error) throw error

        // Update congregation links
        await supabase.from('congregation_admins').delete().eq('user_id', editing.id)
        if (role === 'admin_congregation' && selectedCongs.length > 0) {
          await supabase.from('congregation_admins').insert(
            selectedCongs.map(cid => ({ user_id: editing.id, congregation_id: cid }))
          )
        }
        toast.success('Usuário atualizado')
      } else {
        // Create via Admin API
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
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
        await supabase.from('profiles').update({ full_name: fullName, role }).eq('id', userId)

        if (role === 'admin_congregation' && selectedCongs.length > 0) {
          await supabase.from('congregation_admins').insert(
            selectedCongs.map(cid => ({ user_id: userId, congregation_id: cid }))
          )
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
function PasswordModal({ open, user, onClose }: { open: boolean; user: UserWithCongs | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { setPassword(''); setShowPw(false) }, [open])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !SERVICE_ROLE_KEY) return
    setLoading(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error('Erro ao redefinir senha')
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
        <p className="text-sm text-stone-500">Definir nova senha para <strong>{user?.full_name}</strong></p>
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
            className="absolute right-3 top-9 text-stone-400"
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
