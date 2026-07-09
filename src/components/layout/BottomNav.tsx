import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Bus, Users, ClipboardList,
  Building2, BarChart3, Settings, MoreHorizontal,
  Search, Shield, Star, Receipt, Truck, UserCog,
  Bell, CheckCircle2, CalendarDays, X, LogOut, Moon, Sun, Anchor, Sparkles, UserCheck
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { usePendingRequests } from '../../hooks/usePendingRequests'
import { cn } from '../../lib/utils'
import toast from 'react-hot-toast'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
}

export function BottomNav() {
  const { isAdminGeneral, isCapitan, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const pendingRequests = usePendingRequests()
  const [moreOpen, setMoreOpen] = useState(false)

  // Close "Mais" sheet on route change
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
    toast.success('Sessão encerrada')
  }

  // ── Main items (always visible in bottom bar) ──
  const mainItems: NavItem[] = isCapitan ? [
    { to: '/captain', icon: <Anchor className="w-5 h-5" />, label: 'Embarque' },
  ] : isAdminGeneral ? [
    { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Painel' },
    { to: '/congregations', icon: <Building2 className="w-5 h-5" />, label: 'Congr.' },
    { to: '/vehicles', icon: <Bus className="w-5 h-5" />, label: 'Veículos' },
    { to: '/boarding', icon: <ClipboardList className="w-5 h-5" />, label: 'Embarque' },
  ] : [
    { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Painel' },
    { to: '/vehicles', icon: <Bus className="w-5 h-5" />, label: 'Veículos' },
    { to: '/passengers', icon: <Users className="w-5 h-5" />, label: 'Passag.' },
    { to: '/boarding', icon: <ClipboardList className="w-5 h-5" />, label: 'Embarque' },
  ]

  // ── Extra items (inside "Mais" sheet) ──
  const extraItems: NavItem[] = isCapitan ? [
    { to: '/changelog', icon: <Sparkles className="w-5 h-5" />, label: 'Atualizações' },
    { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
  ] : isAdminGeneral ? [
    { to: '/captains', icon: <UserCheck className="w-5 h-5" />, label: 'Capitães' },
    { to: '/passengers', icon: <Users className="w-5 h-5" />, label: 'Passageiros' },
    { to: '/availability', icon: <BarChart3 className="w-5 h-5" />, label: 'Disponibilidade' },
    { to: '/search', icon: <Search className="w-5 h-5" />, label: 'Pesquisa' },
    { to: '/events', icon: <CalendarDays className="w-5 h-5" />, label: 'Eventos' },
    { to: '/finalized-lists', icon: <CheckCircle2 className="w-5 h-5" />, label: 'Listas Finalizadas' },
    { to: '/users', icon: <UserCog className="w-5 h-5" />, label: 'Usuários' },
    { to: '/access-requests', icon: <Bell className="w-5 h-5" />, label: 'Solicitações', badge: pendingRequests },
    { to: '/transport-companies', icon: <Truck className="w-5 h-5" />, label: 'Empresas' },
    { to: '/ratings', icon: <Star className="w-5 h-5" />, label: 'Avaliações' },
    { to: '/invoices', icon: <Receipt className="w-5 h-5" />, label: 'Notas Fiscais' },
    { to: '/audit', icon: <Shield className="w-5 h-5" />, label: 'Auditoria' },
    { to: '/changelog', icon: <Sparkles className="w-5 h-5" />, label: 'Atualizações' },
    { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
  ] : [
    { to: '/captains', icon: <UserCheck className="w-5 h-5" />, label: 'Capitães' },
    { to: '/access-requests', icon: <Bell className="w-5 h-5" />, label: 'Solicitações', badge: pendingRequests },
    { to: '/availability', icon: <BarChart3 className="w-5 h-5" />, label: 'Disponibilidade' },
    { to: '/search', icon: <Search className="w-5 h-5" />, label: 'Pesquisa' },
    { to: '/ratings', icon: <Star className="w-5 h-5" />, label: 'Avaliações' },
    { to: '/invoices', icon: <Receipt className="w-5 h-5" />, label: 'Notas Fiscais' },
    { to: '/audit', icon: <Shield className="w-5 h-5" />, label: 'Auditoria' },
    { to: '/changelog', icon: <Sparkles className="w-5 h-5" />, label: 'Atualizações' },
    { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
  ]

  // Is current route inside the "Mais" items?
  const isMoreActive = extraItems.some(item => location.pathname.startsWith(item.to))

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex items-stretch lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mainItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors min-w-0 min-h-[60px]',
              isActive ? 'text-amber-500' : 'text-stone-400 dark:text-stone-500'
            )}
          >
            {item.icon}
            <span className="truncate w-full text-center px-0.5 leading-tight">{item.label}</span>
          </NavLink>
        ))}

        {/* Mais button */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            'flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors min-w-0 min-h-[60px]',
            (moreOpen || isMoreActive) ? 'text-amber-500' : 'text-stone-400 dark:text-stone-500'
          )}
        >
          <span className="relative">
            <MoreHorizontal className="w-5 h-5" />
            {pendingRequests > 0 && isAdminGeneral && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingRequests > 9 ? '9+' : pendingRequests}
              </span>
            )}
          </span>
          <span className="leading-tight">Mais</span>
        </button>
      </nav>

      {/* "Mais" bottom sheet */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 rounded-t-2xl shadow-2xl lg:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle + header */}
            <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
              <div className="w-10 h-1 bg-stone-200 dark:bg-stone-700 rounded-full absolute left-1/2 -translate-x-1/2 top-2" />
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Menu</p>
              <div className="flex items-center gap-2">
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grid of nav items */}
            <div className="grid grid-cols-4 gap-1 px-3 pt-1 pb-2">
              {extraItems.map(item => {
                const isActive = location.pathname.startsWith(item.to)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all text-center',
                      isActive
                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800'
                    )}
                  >
                    <span className="relative">
                      {item.icon}
                      {item.badge && item.badge > 0 ? (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>

            {/* Logout */}
            <div className="px-4 pb-3 pt-1 border-t border-stone-100 dark:border-stone-800">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-sm font-medium"
              >
                <LogOut className="w-5 h-5" />
                Sair do sistema
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
