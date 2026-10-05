import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { AppShell } from '#/components/app/app-shell'
import { SyncBridge } from '#/components/app/sync-bridge'
import { ensureUser, hasLocalContent } from '#/offline/guard'

/**
 * Layout for signed-in admins and invited members. Study pages read the
 * person's device copy, so a copy that hasn't downloaded the question bank
 * yet goes to /setup first.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    await ensureUser(context.queryClient)
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
