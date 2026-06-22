import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, ArrowLeft, Send, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import toast from 'react-hot-toast'

export function RequestAccessPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [congregationName, setCongregationName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.from('access_requests').insert({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        congregation_name: congregationName.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
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

      setSubmitted(true)
    } catch {
      toast.error('Erro ao enviar solicitação. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

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
                  Sua solicitação foi recebida. O Administrador Geral irá analisá-la em breve.
                </p>
                <p className="text-sm text-stone-500 mt-2 leading-relaxed">
                  Você receberá um e-mail de convite quando seu acesso for aprovado.
                </p>
              </div>
              <div className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Solicita­ção registrada para:</p>
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mt-0.5">{email}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/login')} icon={<ArrowLeft className="w-4 h-4" />} className="w-full">
                Voltar ao Login
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
                  label="Congregação *"
                  value={congregationName}
                  onChange={e => setCongregationName(e.target.value)}
                  placeholder="Nome da sua congregação"
                  required
                />
                <Input
                  label="Telefone (opcional)"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Observações (opcional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Informações adicionais que ajudem na análise..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <Button type="submit" loading={loading} size="lg" className="w-full mt-2" icon={<Send className="w-4 h-4" />}>
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
