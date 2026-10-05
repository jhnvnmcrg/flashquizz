import type { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'

import { viewerQuery } from '#/queries'

import { clearLease, type DeviceUser, openLeasedCopy, readActiveLease, recordUser, wipeLocalData } from './auth'
import { loadLocalState, localStore } from './store'

/** Re-confirm with the server at most this often while the device holds a lease. */
const RECONFIRM_MS = 10 * 60_000
let lastConfirm = 0

/** Background check for a device that's already open: still the same person, still allowed in? */
async function confirmUser(queryClient: QueryClient) {
  try {
    const viewer = await queryClient.fetchQuery({ ...viewerQuery, staleTime: 0 })
    // Someone else signed in here: open their copy (the other one stays for when they're back).
    if (await recordUser(viewer)) window.location.reload()
  } catch (error) {
    if (!isRedirect(error)) return // offline or a hiccup: try again later
    const to = String(error.options.to ?? '')
    if (to.includes('forbidden')) {
      // No access (any more): remove this person's copy from the device.
      await wipeLocalData()
      window.location.assign('/forbidden')
    } else {
      await clearLease()
      window.location.assign('/sign-in')
    }
  }
}

/**
 * The sign-in check for app pages. The real security boundary is the
 * `requireUser` middleware on every server function; this lets a device the
 * server confirmed in the last 30 days straight into that person's copy
 * (that's what makes the app open offline) and re-checks in the background.
 * Otherwise it asks the server first, which redirects to sign-in or
 * "forbidden".
 */
export async function ensureUser(queryClient: QueryClient): Promise<DeviceUser> {
  const lease = await readActiveLease().catch(() => null)
  if (lease) {
    await openLeasedCopy(lease)
    if (navigator.onLine && Date.now() - lastConfirm > RECONFIRM_MS) {
      lastConfirm = Date.now()
      void confirmUser(queryClient)
    }
    return { userId: lease.userId, isAdmin: lease.isAdmin }
  }
  const viewer = await queryClient.ensureQueryData(viewerQuery)
  lastConfirm = Date.now()
  // This page still had someone else's copy open (their lease ran out meanwhile).
  if (await recordUser(viewer)) window.location.reload()
  return viewer
}

/** Has this person's copy downloaded the question bank yet? */
export async function hasLocalContent() {
  if (!localStore.state.ready) await loadLocalState().catch(() => undefined)
  return localStore.state.hasContent
}
