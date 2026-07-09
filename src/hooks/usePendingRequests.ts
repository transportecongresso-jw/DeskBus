import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Singleton-like state shared between Sidebar and BottomNav instances.
let globalCount = 0
const listeners = new Set<(count: number) => void>()

function notifyListeners(count: number) {
  globalCount = count
  listeners.forEach(fn => fn(count))
}

// Store the user context needed for filtered queries
let currentUserId: string | null = null
let currentIsAdmin = false
let currentCongIds: string[] = []

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
    currentUserId = null
  }
}

async function fetchGlobalCount() {
  if (!currentUserId) { notifyListeners(0); return }

  if (currentIsAdmin) {
    // SuperAdmin sees all pending requests
    const { count: c } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    notifyListeners(c ?? 0)
  } else if (currentCongIds.length > 0) {
    // Congregation admins see only captain requests for their congregations
    const { count: c } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('requested_role', 'captain')
      .in('congregation_id', currentCongIds)
    notifyListeners(c ?? 0)
  } else {
    notifyListeners(0)
  }
}

export function usePendingRequests() {
  const { user, isAdminGeneral, congregationIds } = useAuth()
  const [count, setCount] = useState(globalCount)

  useEffect(() => {
    const hasAccess = isAdminGeneral || congregationIds.length > 0
    if (!hasAccess || !user) return

    // Update shared context for the fetch function
    currentUserId = user.id
    currentIsAdmin = isAdminGeneral
    currentCongIds = congregationIds

    listeners.add(setCount)
    subscribeChannel()
    setCount(globalCount)

    return () => {
      listeners.delete(setCount)
      unsubscribeChannel()
    }
  }, [user?.id, isAdminGeneral, congregationIds.join(',')])

  return count
}
