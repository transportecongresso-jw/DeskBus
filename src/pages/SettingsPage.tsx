import { useState } from 'react'
import { Settings, User, Lock, Moon, Sun, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { HelpIcon } from '../components/ui/Tooltip'
import toast from 'react-hot-toast'

export function SettingsPage() {
  const { profile, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user!.id)
    if (error) {
      toast.error('Erro ao salvar perfil')
    } else {
      toast.success('Perfil atualizado!')
    }
    setSavingProfile(false)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }
    if (newPassword.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error('Erro ao alterar senha')
    } else {
      toast.success('Senha alterada com sucesso!')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    }
    setSavingPassword(false)
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <PageHeader
        title="Configurações"
        subtitle="Gerencie seu perfil e preferências"
        icon={<Settings className="w-6 h-6" />}
      />

      {/* Profile */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-stone-400" />
            <CardTitle>Meu Perfil</CardTitle>
          </div>
        </CardHeader>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <Input
            label="Nome Completo"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
          />
          <Input
            label="E-mail"
            value={profile?.email ?? ''}
            disabled
            hint="O e-mail não pode ser alterado aqui. Entre em contato com o administrador."
          />
          <div className="flex items-center gap-2 p-3 bg-stone-50 dark:bg-stone-700 rounded-xl">
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-200">Tipo de Acesso</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {profile?.role === 'admin_general' ? 'Administrador Geral — acesso completo ao sistema' : 'Administrador de Congregação'}
              </p>
            </div>
          </div>
          <Button type="submit" loading={savingProfile} className="w-fit">Salvar Perfil</Button>
        </form>
      </Card>

      {/* Password */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-stone-400" />
            <CardTitle>Alterar Senha</CardTitle>
            <HelpIcon content="Por segurança, sua senha deve ter no mínimo 8 caracteres e combinar letras e números." />
          </div>
        </CardHeader>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <Input
            label="Nova Senha"
            type={showNewPw ? 'text' : 'password'}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            rightElement={
              <button type="button" onClick={() => setShowNewPw(v => !v)} className="text-stone-400">
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Input
            label="Confirmar Nova Senha"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
            required
          />
          <Button type="submit" loading={savingPassword} className="w-fit">Alterar Senha</Button>
        </form>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between p-4 bg-stone-50 dark:bg-stone-700 rounded-xl">
          <div>
            <p className="text-sm font-medium text-stone-700 dark:text-stone-200">Tema</p>
            <p className="text-xs text-stone-400 mt-0.5">
              Atualmente: {theme === 'light' ? 'Claro' : 'Escuro'}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-stone-200 dark:border-stone-600 hover:border-amber-400 transition-all text-sm font-medium text-stone-600 dark:text-stone-300 cursor-pointer"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            {theme === 'light' ? 'Ativar Modo Escuro' : 'Ativar Modo Claro'}
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-3">
          Sua preferência de tema é salva automaticamente neste dispositivo.
        </p>
      </Card>
    </div>
  )
}
