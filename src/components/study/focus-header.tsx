import { Link } from '@tanstack/react-router'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'

/** Minimal chrome for sessions and exams: exit, progress, actions. */
export function FocusHeader({
  title,
  progress,
  actions,
  onExit,
}: {
  title: ReactNode
  progress?: ReactNode
  actions?: ReactNode
  onExit?: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
        {onExit ? (
          <Button variant="ghost" size="icon" aria-label="Exit" onClick={onExit}>
            <XIcon />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label="Exit" asChild>
            <Link to="/">
              <XIcon />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
      {progress}
    </header>
  )
}

/** Thin segmented bar: green = right, red = wrong, grey = to do. */
export function SessionProgress({
  results,
  current,
}: {
  results: (boolean | null)[]
  current: number
}) {
  const total = results.length
  if (total > 60) {
    const done = results.filter((r) => r !== null).length
    return (
      <div className="h-1 bg-secondary" aria-hidden>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    )
  }
  return (
    <div className="mx-auto flex h-1 w-full max-w-3xl gap-0.5 px-4" aria-hidden>
      {results.map((r, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional segments
          key={i}
          className={
            r === true
              ? 'flex-1 rounded-full bg-success'
              : r === false
                ? 'flex-1 rounded-full bg-destructive'
                : i === current
                  ? 'flex-1 rounded-full bg-info'
                  : 'flex-1 rounded-full bg-secondary'
          }
        />
      ))}
    </div>
  )
}
