import { useEffect, useState } from 'react'
import { Building2, Plus, Pencil, Trash2, UserPlus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Congregation, Profile } from '../types'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { HelpIcon } from '../components/ui/Tooltip'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'

interface CongregationWithAdmins extends Congregation {
  admins: Profile[]
}

export function CongregationsPage() {
  const { user } = useAuth()
  const [congregations, setCongregations] = useState<CongregationWithAdmins[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Congregation | null>(null)
  const [deleting, setDeleting] = useState<Congregation | null>(null)
  const [showAdminModal, setShowAdminModal] = useState<CongregationWithAdmins | null>(null)

  useEffect(() => { loadCongregations() }, [])

  async function loadCongregations() {
    setLoading(true)
    const { data: congs } = await supabase.from('congregations').select('*').order('name')
    if (!congs) { setLoading(false); return }

    const withAdmins: CongregationWithAdmins[] = await Promise.all(
      congs.map(async (c) => {
        const { data: admins } = await supabase
          .from('congregation_admins')
          .select('profiles(*)')
          .eq('congregation_id', c.id)
        return {
          ...c,
          admins: (admins ?? []).map((a: any) => a.profiles).filter(Boolean),
        }
      })
    )
    setCongregations(withAdmins)
    setLoading(false)
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('congregations').delete().eq('id', deleting.id)
    if (error) {
      toast.error('Erro ao excluir congregação')
    } else {
      toast.success('Congregação excluída')
      setDeleting(null)
      loadCongregations()
    }
  }

  const filtered = congregations.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Congregações"
        subtitle="Gerencie todas as congregações do sistema"
        icon={<Building2 className="w-6 h-6" />}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setShowForm(true) }}>
            Nova Congregação
          </Button>
        }
      />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Pesquisar congregações..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
          <HelpIcon content="Pesquise pelo nome ou cidade da congregação. Clique em uma congregação para ver seus detalhes." />
        </div>

        {loading ? (
          <Spinner className="py-10" label="Carregando congregações..." />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma congregação encontrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(cong => (
              <div key={cong.id} className="p-4 rounded-xl border border-stone-100 dark:border-stone-700 hover:border-amber-200 dark:hover:border-amber-700 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-stone-800 dark:text-stone-100">{cong.name}</h3>
                    {cong.city && <p className="text-sm text-stone-400">{cong.city}</p>}
                  </div>
                  <Badge variant="info">{cong.admins.length} admin{cong.admins.length !== 1 ? 's' : ''}</Badge>
                </div>

                {cong.admins.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-stone-400 mb-1">Administradores:</p>
                    {cong.admins.map(a => (
                      <p key={a.id} className="text-xs text-stone-600 dark:text-stone-300">{a.full_name}</p>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-700">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<UserPlus className="w-3.5 h-3.5" />}
                    onClick={() => setShowAdminModal(cong)}
                  >
                    Admins
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil className="w-3.5 h-3.5" />}
                    onClick={() => { setEditing(cong); setShowForm(true) }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    onClick={() => setDeleting(cong)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <CongregationForm
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editing}
        onSaved={() => { setShowForm(false); loadCongregations() }}
        createdBy={user!.id}
      />

      {/* Admin Modal */}
      {showAdminModal && (
        <AdminManagementModal
          congregation={showAdminModal}
          onClose={() => setShowAdminModal(null)}
          onSaved={() => { setShowAdminModal(null); loadCongregations() }}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Excluir Congregação"
        message={`Tem certeza que deseja excluir "${deleting?.name}"? Esta ação não pode ser desfeita e removerá todos os dados relacionados.`}
      />
    </div>
  )
}

// --- CongregationForm ---
function CongregationForm({ open, onClose, editing, onSaved, createdBy }: {
  open: boolean; onClose: () => void; editing: Congregation | null;
  onSaved: () => void; createdBy: string
}) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setName(editing?.name ?? '')
    setCity(editing?.city ?? '')
  }, [editing, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) {
        const { error } = await supabase.from('congregations').update({ name, city }).eq('id', editing.id)
        if (error) throw error
        toast.success('Congregação atualizada')
      } else {
        const { error } = await supabase.from('congregations').insert({ name, city, created_by: createdBy })
        if (error) throw error
        toast.success('Congregação criada')
      }
      onSaved()
    } catch {
      toast.error('Erro ao salvar congregação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Congregação' : 'Nova Congregação'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome da Congregação"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ex: Congregação Central"
          required
        />
        <Input
          label="Cidade"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="Ex: São Paulo - SP"
        />
        <div className="flex gap-3 mt-2">
          <Button variant="outline" type="button" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="submit" loading={loading} className="flex-1">
            {editing ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// --- AdminManagementModal ---
function AdminManagementModal({ congregation, onClose, onSaved }: {
  congregation: CongregationWithAdmins; onClose: () => void; onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState(congregation.admins)

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      // Find user by email
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email.trim().toLowerCase())
        .single()

      if (!profileData) {
        toast.error('Usuário não encontrado com esse e-mail')
        return
      }

      const { error } = await supabase.from('congregation_admins').insert({
        congregation_id: congregation.id,
        user_id: profileData.id,
      })

      if (error?.code === '23505') {
        toast.error('Este usuário já é administrador desta congregação')
      } else if (error) {
        throw error
      } else {
        toast.success('Administrador adicionado')
        setAdmins(prev => [...prev, profileData])
        setEmail('')
      }
    } catch {
      toast.error('Erro ao adicionar administrador')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveAdmin(userId: string) {
    const { error } = await supabase
      .from('congregation_admins')
      .delete()
      .eq('congregation_id', congregation.id)
      .eq('user_id', userId)

    if (!error) {
      setAdmins(prev => prev.filter(a => a.id !== userId))
      toast.success('Administrador removido')
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Administradores — ${congregation.name}`} size="md">
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAddAdmin} className="flex gap-2">
          <Input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="E-mail do usuário..."
            type="email"
            className="flex-1"
            required
          />
          <Button type="submit" loading={loading} size="md">Adicionar</Button>
        </form>

        <div className="flex flex-col gap-2">
          {admins.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-4">Nenhum administrador atribuído</p>
          ) : (
            admins.map(admin => (
              <div key={admin.id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-stone-700 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{admin.full_name}</p>
                  <p className="text-xs text-stone-400">{admin.email}</p>
                </div>
                <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4" />} className="text-rose-500"
                  onClick={() => handleRemoveAdmin(admin.id)} />
              </div>
            ))
          )}
        </div>

        <Button variant="outline" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  )
}
