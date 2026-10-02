import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { loadLocalState } from '#/offline/store'
import { connectQueryClient, onRemoteChange, requestSync } from '#/offline/sync/engine'
import { setSync } from '#/offline/sync/status'

/**
 * Keeps the device copy fresh while the app is open: on launch, when the
 * connection returns, and when the app comes back to the foreground. There's
 * no background sync (iOS has none), so this is the whole schedule.
 */
export function SyncBridge() {
  const queryClient = useQueryClient()
  useEffect(() => {
    connectQueryClient(queryClient)
  }, [queryClient])

  useEffect(() => {
    loadLocalState()
      .catch(() => undefined)
      .then(() => requestSync({ force: true }))

    const online = () => requestSync({ force: true })
    const offline = () => setSync({ phase: 'offline' })
    const visible = () => {
      if (document.visibilityState === 'visible') void requestSync()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    const stopRemote = onRemoteChange(() => void loadLocalState())
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
      stopRemote()
    }
  }, [])
  return null
}
