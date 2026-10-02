import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '#/components/ui/button'
import { useOnline } from '#/hooks/use-online'

// After a deploy, an open page can ask for code files that no longer exist.
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
const CHUNK_RELOAD_KEY = 'fq-chunk-reload'

/** Reload once (not in a loop) when the app's own files fail to load. */
function useChunkErrorReload(message: string) {
  useEffect(() => {
    if (!CHUNK_ERROR.test(message)) return
    try {
      if (Date.now() - Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0) < 60_000) return
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    } catch {
      return
    }
    window.location.reload()
  }, [message])
}

export function RoutePending() {
  return (
    <output className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </output>
  )
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const online = useOnline()
  const message = error instanceof Error ? error.message : ''
  useChunkErrorReload(message)
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-xl font-bold">{online ? "This page didn't load" : 'You’re offline'}</h1>
      <p className="mt-2 text-muted-foreground">
        {online ? message || 'Something went wrong.' : 'This page needs a connection. Reconnect and try again.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button
          onClick={() => {
            reset()
            router.invalidate()
          }}
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Go to Today</Link>
        </Button>
      </div>
    </div>
  )
}

export function RouteNotFound() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The link may be old, or the item was removed.</p>
      <Button className="mt-6" asChild>
        <Link to="/">Go to Today</Link>
      </Button>
    </div>
  )
}
