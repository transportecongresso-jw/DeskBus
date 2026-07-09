import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { PATCH_NOTES, PatchNote } from '../lib/patchNotes'

function storageKey(userId: string) {
  return `deskbus_seen_versions_${userId}`
}

function getSeenVersions(userId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function markVersionsSeen(userId: string, versions: string[]) {
  try {
    const current = getSeenVersions(userId)
    const merged = Array.from(new Set([...current, ...versions]))
    localStorage.setItem(storageKey(userId), JSON.stringify(merged))
  } catch {
    // localStorage unavailable — fail silently
  }
}

export function usePatchNotes() {
  const { user } = useAuth()
  const [unseen, setUnseen] = useState<PatchNote[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) { setUnseen([]); setReady(true); return }
    const seen = getSeenVersions(user.id)
    const pending = PATCH_NOTES.filter(n => !seen.includes(n.version))
    setUnseen(pending)
    setReady(true)
  }, [user?.id])

  function dismissAll() {
    if (!user) return
    markVersionsSeen(user.id, unseen.map(n => n.version))
    setUnseen([])
  }

  return { unseen, ready, dismissAll }
}
