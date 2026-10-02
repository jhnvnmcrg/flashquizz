import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import {
  CloudCheckIcon,
  CloudOffIcon,
  DownloadIcon,
  LoaderCircleIcon,
  LogInIcon,
  type LucideIcon,
  RefreshCwIcon,
  RefreshCwOffIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { WipeDialog } from '#/components/app/wipe-dialog'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { useOnline } from '#/hooks/use-online'
import { SYNC_PROTOCOL } from '#/lib/schemas/sync'
import { wipeLocalData } from '#/offline/auth'
import { getMeta } from '#/offline/db'
import { localStore } from '#/offline/store'
import { requestSync } from '#/offline/sync/engine'
import { cachedImageIds } from '#/offline/sync/images'
import { type SyncStatus, syncStore } from '#/offline/sync/status'
import { getAppVersion, promptInstall, pwaStore } from '#/pwa/register'

export const Route = createFileRoute('/_app/offline')({
  head: () => ({ meta: [{ title: 'Offline & sync · FlashQuizz' }] }),
  component: OfflinePage,
})

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
function ago(at: Date) {
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  return hours < 48 ? relative.format(-hours, 'hour') : relative.format(-Math.round(hours / 24), 'day')
}

async function readStorage() {
  const estimate = await navigator.storage?.estimate?.()
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  return { usage: estimate?.usage ?? 0, persisted }
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`

function headline(s: SyncStatus, online: boolean): { icon: LucideIcon; title: string; body: string; tone: string } {
  if (!online || s.phase === 'offline') {
    return {
      icon: CloudOffIcon,
      title: 'You’re offline',
      body: 'Study as usual. Answers wait on this device and upload when you’re back online.',
      tone: 'text-muted-foreground',
    }
  }
  switch (s.phase) {
    case 'syncing':
      return { icon: LoaderCircleIcon, title: 'Syncing…', body: 'Bringing this device up to date.', tone: 'text-info' }
    case 'signed-out':
      return {
        icon: LogInIcon,
        title: 'Sign in to sync',
        body: 'Your sign-in expired. Studying still works; sign in again to upload and download changes.',
        tone: 'text-warning-foreground',
      }
    case 'update-required':
      return {
        icon: RefreshCwOffIcon,
        title: 'Update needed to sync',
        body: 'This copy of FlashQuizz is older than the server. Reload to update; your answers stay on this device until then.',
        tone: 'text-warning-foreground',
      }
    case 'error':
      return {
        icon: TriangleAlertIcon,
        title: 'Sync didn’t finish',
        body: s.error ?? 'Something went wrong. Try again in a moment.',
        tone: 'text-destructive',
      }
    default:
      return {
        icon: CloudCheckIcon,
        title: 'Up to date',
        body: s.lastSyncedAt ? `Last synced ${ago(s.lastSyncedAt)}.` : 'Ready to study offline.',
        tone: 'text-success',
      }
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Meter({ label, value, total, note }: { label: string; value: number; total: number; note?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {total ? `${value.toLocaleString()} of ${total.toLocaleString()}` : 'Not downloaded yet'}
        </span>
      </div>
      <Progress value={pct} aria-label={`${label}: ${pct}%`} />
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

function usePlatform() {
  const [platform] = useState(() => {
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    return { ios, android: /Android/.test(ua), mac: /Macintosh/.test(ua) && !ios, standalone }
  })
  return platform
}

function InstallSteps() {
  const platform = usePlatform()
  const prompt = useSelector(pwaStore, (s) => s.installPrompt)
  if (platform.standalone) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheckIcon className="size-4 text-success" aria-hidden /> FlashQuizz is installed on this device.
      </p>
    )
  }
  return (
    <div className="space-y-3 text-sm">
      {prompt ? (
        <Button onClick={() => void promptInstall()}>
          <DownloadIcon /> Install FlashQuizz
        </Button>
      ) : null}
      {platform.ios ? (
        <p>
          In <strong>Safari</strong>, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Open
          FlashQuizz from the home screen and sign in there: the installed app keeps its own copy, separate from Safari.
        </p>
      ) : platform.android ? (
        <p>
          In <strong>Chrome</strong>, open the <strong>⋮</strong> menu and choose <strong>Install app</strong> (or{' '}
          <strong>Add to Home screen</strong>).
        </p>
      ) : (
        <p>
          In <strong>Chrome</strong> or <strong>Edge</strong>, use the install icon at the right of the address bar.
          {platform.mac ? (
            <>
              {' '}
              In <strong>Safari</strong>, choose <strong>File › Add to Dock</strong>.
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}

function OfflinePage() {
  const online = useOnline()
  const status = useSelector(syncStore, (s) => s)
  const held = useSelector(localStore, (s) => s.index.size)
  const total = useSelector(localStore, (s) => s.questionTotal)
  const [images, setImages] = useState({ done: 0, total: 0 })
  const [storage, setStorage] = useState<{ usage: number; persisted: boolean } | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    void (async () => {
      const [list, cached] = await Promise.all([getMeta('images'), cachedImageIds()])
      setImages({ done: [...(list ?? [])].filter((i) => cached.has(i.id)).length, total: list?.length ?? 0 })
    })()
    void getAppVersion().then(setVersion)
  }, [])

  useEffect(() => {
    if (status.images.total) setImages(status.images)
  }, [status.images])

  useEffect(() => {
    void readStorage().then(setStorage)
  }, [])

  const keepSafe = async () => {
    const granted = (await navigator.storage?.persist?.()) ?? false
    setStorage(await readStorage())
    if (granted) toast.success('Offline data is protected on this device')
    else toast('The browser decides this itself; installing the app usually helps')
  }

  const remove = async () => {
    await wipeLocalData()
    setImages({ done: 0, total: 0 })
    setStorage(await readStorage())
    toast.success('Offline data removed from this device')
  }

  const h = headline(status, online)
  const Icon = h.icon
  const syncing = status.phase === 'syncing'
  const stepTotal = status.step === 'questions' ? status.total : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Offline &amp; sync</h1>
        <p className="max-w-prose text-muted-foreground">
          FlashQuizz keeps a copy of the question bank on this device, so you can study without a connection.
          Answers made offline upload the next time you’re online.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
        <div className={`grid size-12 shrink-0 place-items-center rounded-xl bg-secondary ${h.tone}`}>
          <Icon className={`size-6 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{h.title}</p>
          <p className="text-sm text-muted-foreground">{h.body}</p>
          {syncing && stepTotal ? (
            <Progress className="mt-3" value={(status.done / stepTotal) * 100} aria-label="Download progress" />
          ) : null}
        </div>
        <Button variant="outline" disabled={!online || syncing} onClick={() => void requestSync({ force: true })}>
          <RefreshCwIcon /> Sync now
        </Button>
      </section>

      <Section title="On this device">
        <Meter label="Questions" value={held} total={total} />
        <Meter
          label="Images"
          value={images.done}
          total={images.total}
          note={images.total && images.done < images.total ? 'Images download in the background while the app is open.' : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="text-muted-foreground">
            {storage ? `${megabytes(storage.usage)} used` : 'Checking storage…'}
            {storage?.persisted ? ', protected from automatic clean-up' : ''}
          </span>
          {storage && !storage.persisted ? (
            <Button size="sm" variant="ghost" onClick={() => void keepSafe()}>
              <ShieldCheckIcon /> Keep offline data safe
            </Button>
          ) : null}
        </div>
      </Section>

      <Section title="Install the app">
        <div className="flex gap-3">
          <SmartphoneIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <InstallSteps />
        </div>
      </Section>

      <Section title="Remove from this device">
        <p className="text-sm text-muted-foreground">
          Frees the space the question bank and images use. Your progress stays on the server, and the next sync
          downloads everything again.
        </p>
        <Button variant="outline" className="text-destructive" onClick={() => setConfirming(true)}>
          Remove offline data
        </Button>
      </Section>

      <p className="text-xs text-muted-foreground">
        App version {version ?? 'development'}, sync protocol {SYNC_PROTOCOL}
      </p>

      <WipeDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove offline data?"
        actionLabel="Remove"
        onConfirm={() => void remove()}
      />
    </div>
  )
}
