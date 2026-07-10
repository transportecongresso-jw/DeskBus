import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Event, EventDay } from '../types'

interface EventContextValue {
  events: Event[]
  selectedEvent: Event | null
  selectedEventId: string | null
  setSelectedEventId: (id: string | null) => void
  eventDays: EventDay[]
  loading: boolean
  reload: () => void
}

const EventContext = createContext<EventContextValue | null>(null)

const STORAGE_KEY = 'deskbus_selected_event'

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>([])
  const [eventDays, setEventDays] = useState<EventDay[]>([])
  const [selectedEventId, setSelectedEventIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  )
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  // Fire loadEvents() via auth state change only to avoid duplicate calls on boot.
  // INITIAL_SESSION fires immediately and covers the mount case.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        loadEvents()
      }
      if (event === 'SIGNED_OUT') {
        setEvents([])
        setEventDays([])
        setSelectedEventIdState(null)
        localStorage.removeItem(STORAGE_KEY)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => { if (tick > 0) loadEvents() }, [tick])

  async function loadEvents() {
    setLoading(true)
    const { data: evs } = await supabase
      .from('events')
      .select('*')
      .order('start_date')

    const list = evs ?? []
    setEvents(list)

    // Load days for all events
    if (list.length > 0) {
      const { data: days } = await supabase
        .from('event_days')
        .select('*')
        .in('event_id', list.map(e => e.id))
        .order('day_order')
      setEventDays(days ?? [])
    } else {
      setEventDays([])
    }

    // Auto-select first active event if stored one is gone
    if (list.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY)
      const stillExists = stored && list.some(e => e.id === stored)
      if (!stillExists) {
        const first = list.find(e => e.status === 'active') ?? list[0]
        setSelectedEventIdState(first?.id ?? null)
        if (first) localStorage.setItem(STORAGE_KEY, first.id)
      }
    }

    setLoading(false)
  }

  function setSelectedEventId(id: string | null) {
    setSelectedEventIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null

  return (
    <EventContext.Provider value={{
      events,
      selectedEvent,
      selectedEventId,
      setSelectedEventId,
      eventDays: selectedEvent ? eventDays.filter(d => d.event_id === selectedEvent.id) : [],
      loading,
      reload: () => setTick(t => t + 1),
    }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEvent() {
  const ctx = useContext(EventContext)
  if (!ctx) throw new Error('useEvent must be used within EventProvider')
  return ctx
}
