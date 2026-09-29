import { createFileRoute, Outlet } from '@tanstack/react-router'

import { AppShell } from '#/components/app/app-shell'
import { viewerQuery } from '#/queries'

/**
 * Owner-only layout. The real security boundary is the `ownerOnly` middleware
 * on every server function; this guard just redirects before rendering.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => context.queryClient.ensureQueryData(viewerQuery),
  component: AppLayout,
})

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
