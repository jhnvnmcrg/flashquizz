import { useSelector } from '@tanstack/react-store'
import { useMatches } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { applyUpdate, pwaStore, registerServiceWorker } from '#/pwa/register'

/**
 * Registers the service worker and offers new versions. The prompt waits
 * while a study session or exam is on screen, so nothing reloads mid-question.
 */
export function PwaBridge() {
  const updateReady = useSelector(pwaStore, (s) => s.updateReady)
  const focus = useMatches({ select: (m) => m.some((r) => r.staticData?.chrome === 'focus') })

  useEffect(() => {
    registerServiceWorker().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!updateReady || focus) return
    const id = toast('A new version of FlashQuizz is ready', {
      duration: Number.POSITIVE_INFINITY,
      action: { label: 'Reload', onClick: applyUpdate },
    })
    return () => {
      toast.dismiss(id)
    }
  }, [updateReady, focus])

  return null
}
