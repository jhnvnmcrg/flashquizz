import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { CloudOffIcon, RefreshCwIcon } from 'lucide-react'
import { useEffect } from 'react'

import { Logo } from '#/components/app/logo'
import { Button } from '#/components/ui/button'
import { Progress } from '#/components/ui/progress'
import { useOnline } from '#/hooks/use-online'
import { ensureOwner, hasLocalContent } from '#/offline/guard'
import { localStore } from '#/offline/store'
import { requestSync } from '#/offline/sync/engine'
import { type SyncStatus, syncStore } from '#/offline/sync/status'

/** First run on a device: download the question bank before the study screens open. */
export const Route = createFileRoute('/setup')({
  beforeLoad: async ({ context }) => {
    await ensureOwner(context.queryClient)
    if (await hasLocalContent()) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Getting ready · FlashQuizz' }] }),
  component: SetupPage,
})

function stepLabel(s: SyncStatus) {
  if (s.step === 'questions' && s.total) return `Downloading questions: ${s.done.toLocaleString()} of ${s.total.toLocaleString()}`
  if (s.step === 'progress' || s.step === 'sessions' || s.step === 'answers') return 'Bringing over your progress…'
  return 'Checking what to download…'
}

function SetupPage() {
  const navigate = useNavigate()
  const online = useOnline()
  const status = useSelector(syncStore, (s) => s)
  const ready = useSelector(localStore, (s) => s.hasContent)

  useEffect(() => {
    if (online) void requestSync({ force: true })
  }, [online])

  useEffect(() => {
    // Images keep downloading in the background once the text is in.
    if (ready) void navigate({ to: '/', replace: true })
  }, [ready, navigate])

  const failed = status.phase === 'error' || status.phase === 'signed-out' || status.phase === 'update-required'
  const pct = status.step === 'questions' && status.total ? (status.done / status.total) * 100 : undefined

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo className="justify-center text-foreground" />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Getting FlashQuizz ready on this device</h1>
          <p className="text-muted-foreground">
            The question bank is saved here so you can study offline. About 3 MB now; the images (about 55 MB) follow
            in the background.
          </p>
        </div>
        <div className="space-y-3 rounded-2xl border bg-card p-5 text-left">
          {!online ? (
            <p className="flex items-start gap-2 text-sm">
              <CloudOffIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              The first download needs an internet connection. Connect, and it starts by itself.
            </p>
          ) : failed ? (
            <>
              <p className="text-sm">
                {status.phase === 'signed-out'
                  ? 'Your sign-in expired. Sign in again to download.'
                  : status.phase === 'update-required'
                    ? 'This copy of FlashQuizz is out of date. Reload the page to update.'
                    : (status.error ?? 'The download didn’t finish.')}
              </p>
              <Button variant="outline" onClick={() => void requestSync({ force: true })}>
                <RefreshCwIcon /> Try again
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium tabular-nums">{stepLabel(status)}</p>
              <Progress value={pct ?? 8} className={pct === undefined ? 'animate-pulse' : undefined} aria-label="Download progress" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
