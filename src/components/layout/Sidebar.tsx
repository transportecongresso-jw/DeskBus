import { NavLink, useNavigate } from 'react-router-dom'
import {
  Bus, Users, Building2, LayoutDashboard, Search,
  LogOut, Moon, Sun, ClipboardList, Settings, ChevronLeft, ChevronRight, CheckCircle2, Shield, CalendarDays
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { EventSelector } from './EventSelector'
import { cn } from '../../lib/utils'
import { useState } from 'react'
import toast from 'react-hot-toast'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Painel' },
  { to: '/events', icon: <CalendarDays className="w-5 h-5" />, label: 'Eventos', adminOnly: true },
  { to: '/congregations', icon: <Building2 className="w-5 h-5" />, label: 'Congregações', adminOnly: true },
  { to: '/finalized-lists', icon: <CheckCircle2 className="w-5 h-5" />, label: 'Listas Finalizadas', adminOnly: true },
  { to: '/vehicles', icon: <Bus className="w-5 h-5" />, label: 'Veículos' },
  { to: '/passengers', icon: <Users className="w-5 h-5" />, label: 'Passageiros' },
  { to: '/boarding', icon: <ClipboardList className="w-5 h-5" />, label: 'Embarque' },
  { to: '/search', icon: <Search className="w-5 h-5" />, label: 'Pesquisa' },
  { to: '/audit', icon: <Shield className="w-5 h-5" />, label: 'Auditoria' },
  { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Configurações' },
]

export function Sidebar() {
  const { profile, isAdminGeneral, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
    toast.success('Sessão encerrada')
  }

  const filteredNav = navItems.filter(item => !item.adminOnly || isAdminGeneral)

  return (
    <aside className={cn(
      'flex flex-col h-full bg-white dark:bg-stone-900 border-r border-stone-100 dark:border-stone-800',
      'transition-all duration-300',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-stone-100 dark:border-stone-800', collapsed && 'justify-center px-2')}>
        <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <Bus className="w-5 h-5 text-amber-950" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-stone-800 dark:text-stone-100 text-lg leading-none">DeskBus</span>
            <p className="text-[10px] text-stone-400 leading-none mt-0.5">Gestão de Transporte</p>
          </div>
        )}
      </div>

      {/* Event selector */}
      <EventSelector collapsed={collapsed} />

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
        {filteredNav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              collapsed && 'justify-center px-2',
              isActive
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-200'
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-stone-100 dark:border-stone-800 flex flex-col gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title="Alternar tema"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
            'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800',
            collapsed && 'justify-center px-2'
          )}
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          {!collapsed && (theme === 'light' ? 'Modo Escuro' : 'Modo Claro')}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
            'text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && 'Recolher'}
        </button>

        {/* User */}
        {!collapsed && (
          <div className="px-3 py-2 mt-1 bg-stone-50 dark:bg-stone-800 rounded-xl">
            <p className="text-xs font-medium text-stone-700 dark:text-stone-200 truncate">{profile?.full_name}</p>
            <p className="text-[11px] text-stone-400 truncate">{profile?.email}</p>
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">
              {profile?.role === 'admin_general' ? 'Administrador Geral' : 'Admin. Congregação'}
            </p>
          </div>
        )}

        <button
          onClick={handleSignOut}
          title="Sair"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
            'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20',
            collapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  )
}
