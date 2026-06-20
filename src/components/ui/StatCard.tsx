import { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { HelpIcon } from './Tooltip'

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  color?: 'amber' | 'emerald' | 'rose' | 'blue' | 'stone' | 'orange'
  help?: string
  sub?: string
}

const colors = {
  amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400',
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
  stone: 'bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300',
  orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
}

export function StatCard({ label, value, icon, color = 'stone', help, sub }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700 p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">{label}</p>
            {help && <HelpIcon content={help} />}
          </div>
          <p className={cn('text-2xl font-bold', color === 'stone' ? 'text-stone-800 dark:text-stone-100' : colors[color].split(' ').slice(2).join(' '))}>
            {value}
          </p>
          {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
        </div>
        {icon && (
          <div className={cn('p-2.5 rounded-xl', colors[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
