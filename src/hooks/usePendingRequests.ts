import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Shared singleton-like state to avoid duplicate Supabase channel subscriptions
// when both Sidebar and BottomNav call this hook simultaneously.
let globalCount = 0
const listeners = new Set<(count: number) => void>()

function notifyListeners(count: number) {
  globalCount = count
  listeners.forEach(fn => fn(count))
}

let activeChannel: ReturnType<typeof supabase.channel> | null = null
let channelSubscribers = 0

function subscribeChannel() {
  channelSubscribers++
  if (activeChannel) return

  activeChannel = supabase
    .channel('pending_access_requests')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, () => {
      fetchGlobalCount()
    })
    .subscribe()

  fetchGlobalCount()
}

function unsubscribeChannel() {
  channelSubscribers--
  if (channelSubscribers <= 0 && activeChannel) {
    supabase.removeChannel(activeChannel)
    activeChannel = null
    channelSubscribers = 0
    globalCount = 0
  }
}

async function fetchGlobalCount() {
  const { count: c } = await supabase
    .from('access_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
  notifyListeners(c ?? 0)
}

export function usePendingRequests() {
  const { isAdminGeneral } = useAuth()
  const [count, setCount] = useState(globalCount)

  useEffect(() => {
    if (!isAdminGeneral) return

    // Register listener for shared state updates
    listeners.add(setCount)
    subscribeChannel()
    // Sync immediately with current global state
    setCount(globalCount)

    return () => {
      listeners.delete(setCount)
      unsubscribeChannel()
    }
  }, [isAdminGeneral])

  return count
}
