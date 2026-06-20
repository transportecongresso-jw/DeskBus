import { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '../../lib/utils'

interface TooltipProps {
  content: string
  children?: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const positions = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function Tooltip({ content, children, position = 'top', className }: TooltipProps) {
  return (
    <span className={cn('tooltip inline-flex items-center', className)}>
      {children}
      <span className="text-stone-400 hover:text-amber-500 cursor-help ml-1 transition-colors">
        <Info className="w-3.5 h-3.5" />
      </span>
      <span className={cn(
        'tooltip-content w-64 px-3 py-2 bg-stone-800 dark:bg-stone-700 text-white text-xs rounded-xl shadow-lg leading-relaxed',
        positions[position]
      )}>
        {content}
      </span>
    </span>
  )
}

export function HelpIcon({ content, position = 'top' }: { content: string; position?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <span className="tooltip inline-flex cursor-help">
      <Info className="w-4 h-4 text-stone-400 hover:text-amber-500 transition-colors" />
      <span className={cn(
        'tooltip-content w-64 px-3 py-2 bg-stone-800 dark:bg-stone-700 text-white text-xs rounded-xl shadow-lg leading-relaxed z-50',
        positions[position]
      )}>
        {content}
      </span>
    </span>
  )
}
