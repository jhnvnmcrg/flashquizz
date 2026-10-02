import type { QueryClient } from '@tanstack/react-query'
import { createFileRoute, isRedirect, Outlet } from '@tanstack/react-router'

import { AppShell } from '#/components/app/app-shell'
import { SyncBridge } from '#/components/app/sync-bridge'
import { clearOwnerLease, readOwnerLease, recordOwner, wipeLocalData } from '#/offline/auth'
import { viewerQuery } from '#/queries'

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
 * Owner-only layout. The real security boundary is the `ownerOnly` middleware
 * on every server function. This guard lets a device the server confirmed in
 * the last 30 days straight in (that's what makes the app open offline) and
 * re-checks in the background; otherwise it asks the server first.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const lease = await readOwnerLease().catch(() => null)
    if (lease) {
      if (navigator.onLine && Date.now() - lastConfirm > RECONFIRM_MS) {
        lastConfirm = Date.now()
        void confirmOwner(context.queryClient)
      }
      return
    }
    const viewer = await context.queryClient.ensureQueryData(viewerQuery)
    lastConfirm = Date.now()
    await recordOwner(viewer.userId).catch(() => undefined)
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <SyncBridge />
      <Outlet />
    </AppShell>
  )
}
