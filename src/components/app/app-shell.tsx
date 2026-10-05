import { useQuery } from '@tanstack/react-query'
import { Link, useMatches } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { BookOpenCheckIcon, HomeIcon, LibraryBigIcon, TimerIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'
import { userStore } from '#/offline/auth'
import { dashboardQuery } from '#/queries'

import { AccountMenu } from './account-menu'
import { Logo } from './logo'
import { SyncStatus } from './sync-status'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { to: '/', label: 'Today', icon: HomeIcon, exact: true },
  { to: '/review', label: 'Review', icon: BookOpenCheckIcon, exact: false },
  { to: '/exam', label: 'Mock exam', icon: TimerIcon, exact: false },
  { to: '/admin/questions', label: 'Question bank', icon: LibraryBigIcon, exact: false, adminOnly: true },
] as const

function DueBadge({ className }: { className?: string }) {
  // Client-only: not every page prefetches the dashboard during SSR.
  const { data } = useQuery({ ...dashboardQuery, select: (d) => d.overall.due, enabled: typeof window !== 'undefined' })
  if (!data) return null
  return (
    <span
      className={cn(
        'min-w-5 rounded-full bg-primary px-1.5 text-center text-[0.7rem] font-bold leading-5 text-primary-foreground tabular-nums',
        className,
      )}
    >
      <span className="sr-only">, </span>
      {data > 99 ? '99+' : data}
      <span className="sr-only"> due</span>
    </span>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const focus = useMatches({ select: (m) => m.some((r) => r.staticData?.chrome === 'focus') })
  const isAdmin = useSelector(userStore, (u) => u?.isAdmin ?? false)
  const nav = NAV.filter((item) => isAdmin || !('adminOnly' in item))

  if (focus) return <div className="min-h-dvh">{children}</div>

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="text-foreground no-underline">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground data-[status=active]:bg-secondary data-[status=active]:text-foreground"
              >
                {item.label}
                {item.to === '/review' ? <DueBadge /> : null}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SyncStatus />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-12">{children}</main>
      <nav
        aria-label="Main"
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden',
          nav.length === 4 ? 'grid-cols-4' : 'grid-cols-3',
        )}
      >
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            className="relative flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-semibold text-muted-foreground data-[status=active]:text-primary"
          >
            <item.icon className="size-5" aria-hidden />
            {item.label === 'Question bank' ? 'Bank' : item.label}
            {item.to === '/review' ? <DueBadge className="absolute top-1 left-[calc(50%+6px)]" /> : null}
          </Link>
        ))}
      </nav>
    </div>
  )
}
