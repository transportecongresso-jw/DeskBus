import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function usePendingRequests() {
  const { isAdminGeneral } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isAdminGeneral) return
    fetchCount()

    const channel = supabase
      .channel('access_requests_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, fetchCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isAdminGeneral])

  async function fetchCount() {
    const { count: c } = await supabase
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setCount(c ?? 0)
  }

  return count
}
