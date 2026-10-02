import { Link } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import {
  CloudCheckIcon,
  CloudOffIcon,
  LoaderCircleIcon,
  LogInIcon,
  type LucideIcon,
  RefreshCwOffIcon,
  TriangleAlertIcon,
} from 'lucide-react'

import { cn } from '#/lib/utils'
import { type SyncStatus as Status, syncStore } from '#/offline/sync/status'

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0)

function describe(s: Status): { icon: LucideIcon; text: string; tone: string } | null {
  switch (s.phase) {
    case 'syncing':
      if (s.step === 'questions' && s.total) return { icon: LoaderCircleIcon, text: `Downloading ${pct(s.done, s.total)}%`, tone: 'text-info' }
      if (s.step === 'images' && s.images.total && s.images.done < s.images.total) {
        return { icon: LoaderCircleIcon, text: `Images ${pct(s.images.done, s.images.total)}%`, tone: 'text-info' }
      }
      return { icon: LoaderCircleIcon, text: 'Syncing', tone: 'text-info' }
    case 'offline':
      return { icon: CloudOffIcon, text: 'Offline', tone: 'text-muted-foreground' }
    case 'signed-out':
      return { icon: LogInIcon, text: 'Sign in to sync', tone: 'text-warning-foreground' }
    case 'update-required':
      return { icon: RefreshCwOffIcon, text: 'Update to sync', tone: 'text-warning-foreground' }
    case 'error':
      return { icon: TriangleAlertIcon, text: 'Sync failed', tone: 'text-destructive' }
    default:
      return s.lastSyncedAt ? { icon: CloudCheckIcon, text: 'Synced', tone: 'text-muted-foreground' } : null
  }
}

/** Small header pill; opens the Offline & sync page. */
export function SyncStatus({ className }: { className?: string }) {
  const status = useSelector(syncStore, (s) => s)
  const d = describe(status)
  if (!d) return null
  const Icon = d.icon
  return (
    <Link
      to="/offline"
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold no-underline hover:bg-accent',
        d.tone,
        className,
      )}
    >
      <Icon className={cn('size-4', Icon === LoaderCircleIcon && 'animate-spin')} aria-hidden />
      <span className="hidden sm:inline">{d.text}</span>
      <span className="sr-only sm:hidden">{d.text}</span>
    </Link>
  )
}
