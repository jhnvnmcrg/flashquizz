import type { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'

import { viewerQuery } from '#/queries'

import { clearOwnerLease, readOwnerLease, recordOwner, wipeLocalData } from './auth'
import { loadLocalState, localStore } from './store'

/** Re-confirm with the server at most this often while the device holds a lease. */
const RECONFIRM_MS = 10 * 60_000
let lastConfirm = 0

/** Background owner check for a device that's already allowed in. */
async function confirmOwner(queryClient: QueryClient) {
  try {
    const viewer = await queryClient.fetchQuery({ ...viewerQuery, staleTime: 0 })
    await recordOwner(viewer.userId)
  } catch (error) {
    if (!isRedirect(error)) return // offline or a hiccup: try again later
    const to = String(error.options.to ?? '')
    if (to.includes('forbidden')) {
      // Not the owner after all: remove everything from this device.
      await wipeLocalData()
      window.location.assign('/forbidden')
    } else {
      await clearOwnerLease()
      window.location.assign('/sign-in')
    }
  }
}

/**
 * The owner check for app pages. The real security boundary is the
 * `ownerOnly` middleware on every server function; this lets a device the
 * server confirmed in the last 30 days straight in (that's what makes the
 * app open offline) and re-checks in the background. Otherwise it asks the
 * server first, which redirects to sign-in or "forbidden".
 */
export async function ensureOwner(queryClient: QueryClient) {
  const lease = await readOwnerLease().catch(() => null)
  if (lease) {
    if (navigator.onLine && Date.now() - lastConfirm > RECONFIRM_MS) {
      lastConfirm = Date.now()
      void confirmOwner(queryClient)
    }
    return
  }
  const viewer = await queryClient.ensureQueryData(viewerQuery)
  lastConfirm = Date.now()
  await recordOwner(viewer.userId).catch(() => undefined)
}

/** Has this device downloaded the question bank yet? */
export async function hasLocalContent() {
  if (!localStore.state.ready) await loadLocalState().catch(() => undefined)
  return localStore.state.hasContent
}
