import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Event, EventDay } from '../types'

interface EventContextValue {
  activeEvent: Event | null
  eventDays: EventDay[]
  loading: boolean
  reload: () => void
}

const EventContext = createContext<EventContextValue | null>(null)

export function EventProvider({ children }: { children: ReactNode }) {
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [eventDays, setEventDays] = useState<EventDay[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    loadActive()
  }, [tick])

  async function loadActive() {
    setLoading(true)
    const { data: ev } = await supabase
      .from('events')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (ev) {
      setActiveEvent(ev)
      const { data: days } = await supabase
        .from('event_days')
        .select('*')
        .eq('event_id', ev.id)
        .order('day_order')
      setEventDays(days ?? [])
    } else {
      setActiveEvent(null)
      setEventDays([])
    }
    setLoading(false)
  }

  return (
    <EventContext.Provider value={{ activeEvent, eventDays, loading, reload: () => setTick(t => t + 1) }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEvent() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvent must be used within EventProvider')
  return ctx
}
