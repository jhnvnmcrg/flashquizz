import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router'
import { Loader2Icon } from 'lucide-react'

import { Button } from '#/components/ui/button'

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
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-xl font-bold">This page didn't load</h1>
      <p className="mt-2 text-muted-foreground">{error instanceof Error ? error.message : 'Something went wrong.'}</p>
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
