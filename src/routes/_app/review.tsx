import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { BookmarkIcon, RotateCcwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Markdown } from '#/components/question/markdown'
import { ModuleTag, moduleStyle } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { BOX_INTERVAL_DAYS } from '#/lib/leitner'
import { reviewHubQuery } from '#/queries'
import { startSession } from '#/server/study.functions'

export const Route = createFileRoute('/_app/review')({
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewHubQuery),
  head: () => ({ meta: [{ title: 'Review · FlashQuizz' }] }),
  component: ReviewHub,
})

const BOX_LABEL = ['', 'Learning', 'Tomorrow', '3 days', '1 week', '3 weeks']

function ReviewHub() {
  const { data } = useSuspenseQuery(reviewHubQuery)
  const navigate = useNavigate()
  const start = useServerFn(startSession)
  const mutation = useMutation({
    mutationFn: start,
    onSuccess: ({ id }) => navigate({ to: '/study/$sessionId', params: { sessionId: id } }),
    onError: (e) => toast.error(e.message),
  })

  const begin = (opts: { module?: string; scope?: 'due' | 'bookmarked' | 'mistakes'; mode?: 'review' | 'practice' }) =>
    mutation.mutate({
      data: {
        mode: opts.mode ?? 'review',
        count: 50,
        order: 'smart',
        filters: {
          moduleSlugs: opts.module ? [opts.module] : [],
          topicIds: [],
          sourceSlugs: [],
          scope: opts.scope ?? 'due',
        },
      },
    })

  const deck = data.boxes.reduce((s, b) => s + b.n, 0)
  const maxUpcoming = Math.max(1, ...data.upcoming.map((u) => u.n))

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Review</h1>
          <p className="mt-1 max-w-xl text-muted-foreground">
            Questions you miss or bookmark come back on a schedule: tomorrow, in 3 days, a week, then 3 weeks. A miss
            sends a card back to the start.
          </p>
        </div>
        <Button size="lg" disabled={!data.overall.due || mutation.isPending} onClick={() => begin({})}>
          <RotateCcwIcon />
          {data.overall.due ? `Review ${data.overall.due} due` : 'Nothing due'}
        </Button>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-bold">Due by module</h2>
          <ul className="mt-3 divide-y">
            {data.modules.map((m) => (
              <li key={m.slug} data-module style={moduleStyle(m.accentHue)} className="flex items-center gap-3 py-2.5">
                <ModuleTag code={m.code} hue={m.accentHue} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.shortName}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {m.tally.due} due, {m.tally.missed} missed
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!m.tally.due || mutation.isPending}
                  onClick={() => begin({ module: m.slug })}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-bold">Your deck</h2>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">{deck} cards in rotation</p>
          <ul className="mt-4 space-y-2">
            {[1, 2, 3, 4, 5].map((box) => {
              const n = data.boxes.find((b) => b.box === box)?.n ?? 0
              return (
                <li key={box} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted-foreground">{BOX_LABEL[box]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div className="h-full rounded-r-[4px] bg-chart-1" style={{ width: `${deck ? (n / deck) * 100 : 0}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{n}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Intervals: {BOX_INTERVAL_DAYS.slice(2).map((d) => `${d}d`).join(', ')}
          </p>
          {data.upcoming.length ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Coming up (next 2 weeks)</h3>
              <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="Cards due per day over the next two weeks">
                {data.upcoming.map((u) => (
                  <div key={u.day} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-[4px] bg-chart-1" style={{ height: `${(u.n / maxUpcoming) * 48 + 4}px` }} title={`${u.day}: ${u.n}`} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <BookmarkIcon className="size-5 text-primary" aria-hidden /> Bookmarks
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!data.overall.missed || mutation.isPending}
              onClick={() => begin({ scope: 'mistakes', mode: 'practice' })}
            >
              Practice all {data.overall.missed} misses
            </Button>
            <Button
              variant="outline"
              disabled={!data.bookmarks.length || mutation.isPending}
              onClick={() => begin({ scope: 'bookmarked', mode: 'practice' })}
            >
              Practice bookmarks
            </Button>
          </div>
        </div>
        {data.bookmarks.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {data.bookmarks.map((b) => (
              <li key={b.id} className="flex gap-3 rounded-xl border bg-card px-4 py-3">
                <ModuleTag code={b.moduleCode} hue={b.accentHue} className="h-fit shrink-0" />
                <div className="min-w-0">
                  <Markdown inline className="line-clamp-2 text-[0.95rem]">
                    {b.stem}
                  </Markdown>
                  {b.topic ? <p className="mt-1 text-xs text-muted-foreground">{b.topic}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            Tap the bookmark icon while studying to save a question here.
          </p>
        )}
      </section>
    </div>
  )
}
