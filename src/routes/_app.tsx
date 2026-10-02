import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { AppShell } from '#/components/app/app-shell'
import { SyncBridge } from '#/components/app/sync-bridge'
import { ensureOwner, hasLocalContent } from '#/offline/guard'

/**
 * Owner-only layout. Study pages read the device copy, so a device that
 * hasn't downloaded the question bank yet goes to /setup first.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    await ensureOwner(context.queryClient)
    if (!(await hasLocalContent())) throw redirect({ to: '/setup' })
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
