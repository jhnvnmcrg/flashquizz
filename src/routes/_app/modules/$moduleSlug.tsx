import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Layers3Icon, ListChecksIcon, TimerIcon } from 'lucide-react'

import { ProgressRing } from '#/components/dashboard/progress-ring'
import { moduleStyle } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { moduleQuery } from '#/queries'

export const Route = createFileRoute('/_app/modules/$moduleSlug')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(moduleQuery(params.moduleSlug)),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.module.code} ${loaderData.module.name} · FlashQuizz` : 'Module' }],
  }),
  component: ModulePage,
})

function ModulePage() {
  const { moduleSlug } = Route.useParams()
  const { data } = useSuspenseQuery(moduleQuery(moduleSlug))
  const m = data.module
  const acc = data.tally.answered ? Math.round((data.tally.correct / data.tally.answered) * 100) : null

  return (
    <div data-module style={moduleStyle(m.accentHue)} className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border border-module-line bg-module-soft px-6 py-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProgressRing value={data.tally.seen} total={data.tally.total} size={72} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-module-foreground">{m.code}</p>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{m.name}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">{m.description}</p>
            <p className="mt-2 text-sm tabular-nums">
              {data.tally.total} questions, {data.tally.seen} seen
              {acc !== null ? `, ${acc}% right` : ''}
              {data.tally.due ? `, ${data.tally.due} due for review` : ''}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/study/new" search={{ mode: 'practice', module: m.slug }}>
              <ListChecksIcon /> Practice
            </Link>
          </Button>
          <Button variant="outline" className="bg-card" asChild>
            <Link to="/study/new" search={{ mode: 'flashcards', module: m.slug }}>
              <Layers3Icon /> Flashcards
            </Link>
          </Button>
          <Button variant="outline" className="bg-card" asChild>
            <Link to="/exam" search={{ module: m.slug }}>
              <TimerIcon /> Mock exam
            </Link>
          </Button>
        </div>
      </header>

      {data.subjects.map((s) => (
        <section key={s.id} className="space-y-3">
          <h2 className="text-lg font-bold">{s.name}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {s.topics.map((t) => {
              const tAcc = t.tally.answered ? Math.round((t.tally.correct / t.tally.answered) * 100) : null
              const seenPct = t.tally.total ? (t.tally.seen / t.tally.total) * 100 : 0
              return (
                <li key={t.id} className="flex flex-col rounded-xl border bg-card p-4">
                  <p className="font-semibold leading-snug">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                    {t.tally.total ? `${t.tally.seen}/${t.tally.total} seen` : 'No questions yet'}
                    {tAcc !== null ? `, ${tAcc}% right` : ''}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div className="h-full rounded-full bg-module" style={{ width: `${seenPct}%` }} />
                  </div>
                  {t.tally.total ? (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/study/new" search={{ mode: 'practice', module: m.slug, topic: t.id }}>
                          Practice
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/study/new" search={{ mode: 'flashcards', module: m.slug, topic: t.id }}>
                          Flashcards
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {data.sources.length ? (
        <p className="text-sm text-muted-foreground">
          Sources: {data.sources.map((s) => `${s.shortName} (${s.n})`).join(', ')}
        </p>
      ) : null}
    </div>
  )
}
