import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, ArrowLeft, Send, CheckCircle2, Eye, EyeOff, ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import toast from 'react-hot-toast'

interface CongOption { id: string; name: string; city: string | null }

export function RequestAccessPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [requestedRole, setRequestedRole] = useState<'admin_congregation' | 'captain'>('admin_congregation')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [congregations, setCongregations] = useState<CongOption[]>([])
  const [congLoading, setCongLoading] = useState(true)
  const [congError, setCongError] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')

  useEffect(() => { loadCongregations() }, [])

  async function loadCongregations() {
    setCongLoading(true)
    setCongError(false)
    const { data, error } = await supabase
      .from('congregations')
      .select('id, name, city')
      .order('name')
    if (error || !data) {
      console.error('[RequestAccessPage] Erro ao carregar congregações:', error)
      setCongError(true)
    } else {
      setCongregations(data)
    }
    setCongLoading(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!congregationId) { toast.error('Selecione sua congregação'); return }
    if (password.length < 8) { toast.error('A senha deve ter no mínimo 8 caracteres'); return }
    if (password !== confirmPassword) { toast.error('As senhas não coincidem'); return }

    const selectedCong = congregations.find(c => c.id === congregationId)

    setLoading(true)
    try {
      const { error } = await supabase.from('access_requests').insert({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        congregation_name: selectedCong ? `${selectedCong.name}${selectedCong.city ? ` - ${selectedCong.city}` : ''}` : '',
        congregation_id: congregationId,
        requested_role: requestedRole,
        phone: phone.trim() || null,
        password_temp: password,
        status: 'pending',
      })

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe uma solicitação em análise para este e-mail.')
        } else {
          throw error
        }
        return
      }

      setSubmittedEmail(email.trim().toLowerCase())
      setSubmitted(true)
    } catch {
      toast.error('Erro ao enviar solicitação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const selectedCong = congregations.find(c => c.id === congregationId)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-stone-900 dark:via-stone-900 dark:to-stone-800 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-200/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-rose-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/90 dark:bg-stone-800/90 backdrop-blur-sm rounded-3xl shadow-2xl shadow-amber-100/50 dark:shadow-black/30 p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200 mb-3">
              <Bus className="w-8 h-8 text-amber-950" />
            </div>
            <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">DeskBus</h1>
            <p className="text-stone-400 text-sm mt-0.5">Solicitar Acesso ao Sistema</p>
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-4 animate-fade-in">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-stone-800 dark:text-stone-100">Solicitação Enviada!</h2>
                <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                  {requestedRole === 'captain'
                    ? 'Sua solicitação foi enviada ao administrador da congregação e ao SuperAdmin.'
                    : 'Sua solicitação foi recebida e aguarda aprovação do Administrador Geral.'}
                </p>
              </div>
              <div className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">Quando aprovado, acesse com:</p>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{submittedEmail}</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">e a senha que você definiu</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/login')} icon={<ArrowLeft className="w-4 h-4" />} className="w-full">
                Ir para o Login
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  label="Nome Completo *"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  required
                  autoComplete="name"
                />

                {/* Congregation dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    Congregação <span className="text-rose-500">*</span>
                  </label>

                  {congError ? (
                    <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <p className="text-xs text-rose-600 dark:text-rose-400 flex-1">
                        Não foi possível carregar as congregações.
                      </p>
                      <button
                        type="button"
                        onClick={loadCongregations}
                        className="flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Tentar novamente
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={congregationId}
                        onChange={e => setCongregationId(e.target.value)}
                        required
                        disabled={congLoading}
                        className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                      >
                        <option value="">
                          {congLoading
                            ? 'Carregando congregações...'
                            : congregations.length === 0
                              ? 'Nenhuma congregação disponível'
                              : 'Selecione sua congregação...'}
                        </option>
                        {congregations.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.city ? ` - ${c.city}` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                    </div>
                  )}

                  {!congError && !congLoading && congregations.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 pl-1">
                      Nenhuma congregação cadastrada no sistema. Entre em contato com o administrador.
                    </p>
                  )}
                  {selectedCong && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 pl-1">
                      ✓ {selectedCong.name}{selectedCong.city ? ` — ${selectedCong.city}` : ''}
                    </p>
                  )}
                </div>

                <Input
                  label="E-mail *"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
                <Input
                  label="Telefone *"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  required
                  autoComplete="tel"
                />

                {/* Role selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                    Tipo de Acesso <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'admin_congregation', label: 'Adm. Congregação', desc: 'Gerencia veículos e passageiros' },
                      { value: 'captain',            label: 'Capitão',           desc: 'Controla o embarque no veículo' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRequestedRole(opt.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          requestedRole === opt.value
                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                            : 'border-stone-200 dark:border-stone-600 hover:border-amber-200'
                        }`}
                      >
                        <p className={`text-xs font-semibold ${requestedRole === opt.value ? 'text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-300'}`}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-stone-400 mt-0.5 leading-tight">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-1 border-t border-stone-100 dark:border-stone-700">
                  <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-3">
                    Defina sua senha de acesso
                  </p>
                  <div className="flex flex-col gap-3">
                    <Input
                      label="Senha *"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      hint={password.length > 0 && password.length < 8 ? 'Mínimo 8 caracteres' : undefined}
                      autoComplete="new-password"
                      rightElement={
                        <button type="button" onClick={() => setShowPw(v => !v)} className="text-stone-400 hover:text-stone-600 transition-colors">
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                    <Input
                      label="Confirmar Senha *"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      required
                      hint={confirmPassword.length > 0 && confirmPassword !== password ? 'As senhas não coincidem' : undefined}
                      autoComplete="new-password"
                      rightElement={
                        <button type="button" onClick={() => setShowConfirm(v => !v)} className="text-stone-400 hover:text-stone-600 transition-colors">
                          {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>
                </div>

                <Button type="submit" loading={loading} size="lg" className="w-full mt-1" icon={<Send className="w-4 h-4" />}>
                  Enviar Solicitação
                </Button>
              </form>

              <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-700 text-center">
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center gap-1 mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao Login
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-stone-400 mt-4">
          DeskBus © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
