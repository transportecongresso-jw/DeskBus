import { useState } from 'react'
import { CalendarDays, ChevronDown, CheckCircle2, X } from 'lucide-react'
import { useEvent } from '../../contexts/EventContext'
import { cn } from '../../lib/utils'

const STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-500',
  closed: 'text-stone-400',
  cancelled: 'text-rose-400',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
}

export function MobileEventHeader() {
  const { events, selectedEvent, setSelectedEventId } = useEvent()
  const [open, setOpen] = useState(false)

  if (events.length === 0) return null

  return (
    <>
      {/* Sticky header bar — mobile only */}
      <div className="lg:hidden sticky top-0 z-40 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 px-4 py-2">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-400/10 border border-amber-300 dark:border-amber-700 active:bg-amber-400/20 transition-all"
        >
          <CalendarDays className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 truncate leading-tight">
              {selectedEvent?.name ?? 'Selecionar evento'}
            </p>
            {selectedEvent && (
              <p className={cn('text-[10px] leading-tight', STATUS_COLOR[selectedEvent.status])}>
                {STATUS_LABEL[selectedEvent.status]}
                {selectedEvent.start_date && (
                  <> · {new Date(selectedEvent.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} — {new Date(selectedEvent.end_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</>
                )}
              </p>
            )}
          </div>
          {events.length > 1 && (
            <ChevronDown className="w-4 h-4 text-amber-500 flex-shrink-0" />
          )}
        </button>
      </div>

      {/* Bottom sheet overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="relative bg-white dark:bg-stone-900 rounded-t-3xl shadow-2xl animate-slide-up"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-stone-200 dark:bg-stone-700" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 dark:border-stone-800">
              <div>
                <h2 className="text-base font-bold text-stone-800 dark:text-stone-100">Selecionar Evento</h2>
                <p className="text-xs text-stone-400">{events.length} evento{events.length !== 1 ? 's' : ''} disponível{events.length !== 1 ? 'is' : ''}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-3 space-y-2 pb-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
              {events.map(ev => {
                const isSelected = selectedEvent?.id === ev.id
                const startDate = new Date(ev.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                const endDate = new Date(ev.end_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                return (
                  <button
                    key={ev.id}
                    onClick={() => { setSelectedEventId(ev.id); setOpen(false) }}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left active:scale-[0.98]',
                      isSelected
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-amber-400' : 'bg-stone-200 dark:bg-stone-700'
                    )}>
                      <CalendarDays className={cn('w-5 h-5', isSelected ? 'text-amber-950' : 'text-stone-500 dark:text-stone-400')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-semibold truncate', isSelected ? 'text-amber-800 dark:text-amber-300' : 'text-stone-800 dark:text-stone-100')}>
                        {ev.name}
                      </p>
                      <p className="text-xs text-stone-400 mt-0.5">{startDate} — {endDate}</p>
                      <span className={cn('text-[11px] font-medium', STATUS_COLOR[ev.status])}>
                        {STATUS_LABEL[ev.status]}
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-amber-500 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
