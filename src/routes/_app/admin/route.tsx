import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'

import { userStore } from '#/offline/auth'

export const Route = createFileRoute('/_app/admin')({
  // Only admins edit the question bank (the server functions check too).
  beforeLoad: () => {
    if (!userStore.state?.isAdmin) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Question bank · FlashQuizz' }] }),
  component: AdminLayout,
})

const TABS = [
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/review', label: 'Review queue' },
  { to: '/admin/taxonomy', label: 'Modules & topics' },
  { to: '/admin/people', label: 'People' },
] as const

function AdminLayout() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <h1 className="text-3xl font-extrabold tracking-tight">Question bank</h1>
        <nav aria-label="Question bank" className="flex gap-1">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
