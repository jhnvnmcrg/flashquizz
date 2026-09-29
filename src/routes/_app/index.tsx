import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { FlameIcon, Layers3Icon, ListChecksIcon, TimerIcon } from 'lucide-react'

import { ProgressRing } from '#/components/dashboard/progress-ring'
import { WarmupCard } from '#/components/dashboard/warmup-card'
import { moduleStyle } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { dashboardQuery, warmupQuery } from '#/queries'

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQuery),
      // Resolve the first warm-up question on the server so it's in the HTML.
      context.queryClient.ensureQueryData(warmupQuery([])),
    ]),
  head: () => ({ meta: [{ title: 'Today · FlashQuizz' }] }),
  component: Dashboard,
})

const MODE_LABEL: Record<string, string> = {
  flashcards: 'Flashcards',
  practice: 'Practice',
  review: 'Review',
  exam: 'Mock exam',
}

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQuery)
  const accuracy = data.today.answered ? Math.round((data.today.correct / data.today.answered) * 100) : null

  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <WarmupCard />

        <aside className="space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-bold">Review deck</h2>
            {data.overall.due ? (
              <>
                <p className="mt-1 text-muted-foreground">
                  <span className="text-2xl font-extrabold text-foreground tabular-nums">{data.overall.due}</span>{' '}
                  {data.overall.due === 1 ? 'card is' : 'cards are'} due now.
                </p>
                <Button className="mt-4 w-full" asChild>
                  <Link to="/review">Review now</Link>
                </Button>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Nothing due. Questions you miss or bookmark come back here on a schedule.
              </p>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FlameIcon className="size-4 text-warning" aria-hidden /> Streak
              </p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {data.streak} <span className="text-sm font-semibold text-muted-foreground">{data.streak === 1 ? 'day' : 'days'}</span>
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">Today</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">
                {data.today.answered}
                {accuracy !== null ? (
                  <span className="ml-1.5 text-sm font-semibold text-muted-foreground">{accuracy}% right</span>
                ) : null}
              </p>
            </div>
          </section>

          {data.activeSessions.length ? (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="font-bold">Pick up where you left off</h2>
              <ul className="mt-3 space-y-2">
                {data.activeSessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={s.mode === 'exam' ? '/exam/$sessionId' : '/study/$sessionId'}
                      params={{ sessionId: s.id }}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-accent"
                    >
                      {MODE_LABEL[s.mode]}
                      <span className="font-normal text-muted-foreground tabular-nums">
                        {s.answeredCount}/{s.questionCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.needsReview ? (
            <p className="px-1 text-sm text-muted-foreground">
              {data.needsReview} imported {data.needsReview === 1 ? 'question needs' : 'questions need'} checking —{' '}
              <Link to="/admin/review" className="font-semibold text-info underline-offset-2 hover:underline">
                open the review queue
              </Link>
              .
            </p>
          ) : null}
        </aside>
      </div>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="modules-heading" className="text-xl font-extrabold tracking-tight">
            Modules
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/study/new">
                <ListChecksIcon /> Custom session
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/exam">
                <TimerIcon /> Mock exam
              </Link>
            </Button>
          </div>
        </div>
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {data.modules.map((m) => {
            const acc = m.tally.answered ? Math.round((m.tally.correct / m.tally.answered) * 100) : null
            return (
              <li key={m.slug} data-module style={moduleStyle(m.accentHue)} className="relative">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-module" />
                <div className="flex flex-col gap-4 py-4 pr-4 pl-6 sm:flex-row sm:items-center">
                  <Link to="/modules/$moduleSlug" params={{ moduleSlug: m.slug }} className="group flex min-w-0 flex-1 items-center gap-4">
                    <ProgressRing value={m.tally.seen} total={m.tally.total} />
                    <span className="min-w-0">
                      <span className="block font-bold group-hover:underline">
                        <span className="text-module-foreground">{m.code}</span> {m.name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{m.subjects.join(', ')}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                        {m.tally.seen} of {m.tally.total} seen
                        {acc !== null ? `, ${acc}% right` : ''}
                        {m.tally.due ? `, ${m.tally.due} due` : ''}
                      </span>
                    </span>
                  </Link>
                  <div className="flex gap-2 sm:shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/study/new" search={{ mode: 'flashcards', module: m.slug }}>
                        <Layers3Icon /> Flashcards
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link to="/study/new" search={{ mode: 'practice', module: m.slug }}>
                        <ListChecksIcon /> Practice
                      </Link>
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {data.recentExams.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold tracking-tight">Recent mock exams</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.recentExams.map((e) => (
              <li key={e.id}>
                <Link
                  to="/exam/$sessionId/results"
                  params={{ sessionId: e.id }}
                  className="block rounded-2xl border bg-card p-4 hover:border-primary/50"
                >
                  <p className="text-2xl font-extrabold tabular-nums">
                    {Math.round((e.correctCount / e.questionCount) * 100)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {e.correctCount}/{e.questionCount} on{' '}
                    {e.completedAt ? new Date(e.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
