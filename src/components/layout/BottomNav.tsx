import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Bus, Users, ClipboardList,
  Building2, CheckCircle2, Shield, UserCog, CalendarDays, Settings
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

export function BottomNav() {
  const { isAdminGeneral } = useAuth()

  const items = isAdminGeneral ? [
    { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Painel' },
    { to: '/congregations', icon: <Building2 className="w-5 h-5" />, label: 'Congr.' },
    { to: '/vehicles', icon: <Bus className="w-5 h-5" />, label: 'Veículos' },
    { to: '/boarding', icon: <ClipboardList className="w-5 h-5" />, label: 'Embarque' },
    { to: '/audit', icon: <Shield className="w-5 h-5" />, label: 'Auditoria' },
  ] : [
    { to: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Painel' },
    { to: '/vehicles', icon: <Bus className="w-5 h-5" />, label: 'Veículos' },
    { to: '/passengers', icon: <Users className="w-5 h-5" />, label: 'Passag.' },
    { to: '/boarding', icon: <ClipboardList className="w-5 h-5" />, label: 'Embarque' },
    { to: '/settings', icon: <Settings className="w-5 h-5" />, label: 'Config.' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex items-stretch lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(
            'flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] font-medium transition-colors min-w-0 min-h-[60px]',
            isActive
              ? 'text-amber-500'
              : 'text-stone-400 dark:text-stone-500'
          )}
        >
          {item.icon}
          <span className="truncate w-full text-center px-0.5 leading-tight">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
