import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

const variants = {
  primary: 'bg-amber-400 hover:bg-amber-500 text-amber-950 shadow-sm',
  secondary: 'bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-700 dark:hover:bg-stone-600 dark:text-stone-100',
  danger: 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm',
  ghost: 'hover:bg-stone-100 text-stone-600 dark:hover:bg-stone-700 dark:text-stone-300',
  outline: 'border border-stone-300 hover:bg-stone-50 text-stone-700 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800',
}

const sizes = {
  sm: 'px-3 py-2 text-sm rounded-lg gap-1.5 min-h-[40px]',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2 min-h-[44px]',
  lg: 'px-6 py-3.5 text-base rounded-xl gap-2 min-h-[52px]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  )
}
