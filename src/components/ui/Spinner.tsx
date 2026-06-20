import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2 className={cn('animate-spin text-amber-500', sizes[size])} />
      {label && <p className="text-sm text-stone-400">{label}</p>}
    </div>
  )
}

export function PageSpinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" label={label} />
    </div>
  )
}
