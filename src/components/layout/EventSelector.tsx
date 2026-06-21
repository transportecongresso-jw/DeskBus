import { CalendarDays, ChevronDown } from 'lucide-react'
import { useEvent } from '../../contexts/EventContext'
import { useAuth } from '../../contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/utils'

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-500',
  closed: 'text-stone-400',
  cancelled: 'text-rose-500',
}

interface EventSelectorProps {
  collapsed?: boolean
}

export function EventSelector({ collapsed }: EventSelectorProps) {
  const { events, selectedEvent, setSelectedEventId } = useEvent()
  const { isAdminGeneral, congregationIds } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (events.length === 0) return null

  if (collapsed) {
    return (
      <div className="px-2 py-1.5">
        <div className="w-full flex justify-center">
          <CalendarDays className="w-5 h-5 text-amber-400" />
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative px-2 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 truncate">
            {selectedEvent?.name ?? 'Selecionar evento'}
          </p>
          {selectedEvent && (
            <p className={cn('text-[10px]', STATUS_COLOR[selectedEvent.status])}>
              {STATUS_LABEL[selectedEvent.status]}
            </p>
          )}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-amber-500 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg overflow-hidden">
          {events.map(ev => (
            <button
              key={ev.id}
              onClick={() => { setSelectedEventId(ev.id); setOpen(false) }}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors',
                selectedEvent?.id === ev.id && 'bg-amber-50 dark:bg-amber-900/20'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">{ev.name}</p>
                <p className="text-[10px] text-stone-400">
                  {new Date(ev.start_date + 'T12:00:00').toLocaleDateString('pt-BR')} — {new Date(ev.end_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={cn('text-[10px] font-medium mt-0.5 flex-shrink-0', STATUS_COLOR[ev.status])}>
                {STATUS_LABEL[ev.status]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
