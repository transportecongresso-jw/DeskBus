import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, Eye, EyeOff, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import toast from 'react-hot-toast'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos'
        : 'Erro ao entrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-stone-900 dark:via-stone-900 dark:to-stone-800 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-rose-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white/90 dark:bg-stone-800/90 backdrop-blur-sm rounded-3xl shadow-2xl shadow-amber-100/50 dark:shadow-black/30 p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200 mb-4">
              <Bus className="w-9 h-9 text-amber-950" />
            </div>
            <h1 className="text-3xl font-bold text-stone-800 dark:text-stone-100">DeskBus</h1>
            <p className="text-stone-400 text-sm mt-1">Gestão de Transporte para Assembleias</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
            <Input
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Button type="submit" loading={loading} size="lg" className="mt-2 w-full">
              Entrar
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-stone-100 dark:border-stone-700">
            <p className="text-center text-xs text-stone-400 mb-3">Não tem acesso ainda?</p>
            <button
              type="button"
              onClick={() => navigate('/request-access')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400 transition-all text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              Solicitar Acesso
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          DeskBus © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
