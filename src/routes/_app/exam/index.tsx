import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Segmented } from '#/components/app/segmented'
import { ModuleTag, moduleStyle } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { examsQuery, taxonomyQuery } from '#/queries'
import { startExam } from '#/offline/api'

export const Route = createFileRoute('/_app/exam/')({
  validateSearch: z.object({ module: z.string().optional().catch(undefined) }),
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(taxonomyQuery), context.queryClient.ensureQueryData(examsQuery)]),
  head: () => ({ meta: [{ title: 'Mock exam · FlashQuizz' }] }),
  component: ExamSetup,
})

const PRESETS = [
  { value: 25, label: '25 items', minutes: 30 },
  { value: 50, label: '50 items', minutes: 60 },
  { value: 100, label: '100 items', minutes: 120 },
]

function ExamSetup() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { data: tax } = useSuspenseQuery(taxonomyQuery)
  const { data: exams } = useSuspenseQuery(examsQuery)
  const [modules, setModules] = useState<string[]>(search.module ? [search.module] : [])
  const [count, setCount] = useState(100)
  const [minutes, setMinutes] = useState(120)
  const start = startExam
  const mutation = useMutation({
    mutationFn: start,
    onSuccess: ({ id }) => navigate({ to: '/exam/$sessionId', params: { sessionId: id } }),
    onError: (e) => toast.error(e.message),
  })

  const toggle = (slug: string) =>
    setModules((m) => (m.includes(slug) ? m.filter((s) => s !== slug) : [...m, slug]))
  const active = exams.find((e) => e.status === 'active')

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mock exam</h1>
          <p className="mt-1 max-w-xl text-muted-foreground">
            A timed set with no feedback until you submit, like the board exam. Items are drawn from each module in
            proportion to its question bank. Unanswered items count as wrong.
          </p>
        </div>

        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-info/40 bg-info-soft p-4">
            <p className="font-semibold">You have an exam in progress.</p>
            <Button asChild>
              <Link to="/exam/$sessionId" params={{ sessionId: active.id }}>
                Continue exam
              </Link>
            </Button>
          </div>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Modules</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={modules.length === 0}
              onClick={() => setModules([])}
              className="rounded-full border px-3 py-1.5 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              All modules
            </button>
            {tax.modules.map((m) => (
              <button
                key={m.slug}
                type="button"
                aria-pressed={modules.includes(m.slug)}
                data-module
                style={moduleStyle(m.accentHue)}
                onClick={() => toggle(m.slug)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold',
                  modules.includes(m.slug) && 'border-module bg-module-soft text-module-foreground',
                )}
              >
                {m.code} {m.shortName}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-8">
          <div className="space-y-2">
            <p className="text-sm font-medium">Length</p>
            <Segmented
              label="Number of items"
              value={count}
              onChange={(v) => {
                setCount(v)
                setMinutes(PRESETS.find((p) => p.value === v)?.minutes ?? minutes)
              }}
              options={PRESETS}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Time limit</p>
            <Segmented
              label="Time limit"
              value={minutes}
              onChange={setMinutes}
              options={[30, 60, 90, 120, 180].map((m) => ({ value: m, label: m >= 60 ? `${m / 60} h${m % 60 ? ' 30m' : ''}` : `${m} min` }))}
            />
          </div>
        </div>

        <Button
          size="lg"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ data: { moduleSlugs: modules, count, durationMin: minutes } })}
        >
          {mutation.isPending ? 'Preparing…' : `Start ${count}-item exam`}
        </Button>
      </div>

      <aside className="space-y-3">
        <h2 className="font-bold">History</h2>
        {exams.filter((e) => e.status === 'completed').length ? (
          <ul className="space-y-2">
            {exams
              .filter((e) => e.status === 'completed')
              .map((e) => {
                const pct = Math.round((e.correctCount / e.questionCount) * 100)
                return (
                  <li key={e.id}>
                    <Link
                      to="/exam/$sessionId/results"
                      params={{ sessionId: e.id }}
                      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:border-primary/50"
                    >
                      <span className="w-12 text-xl font-extrabold tabular-nums">{pct}%</span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-semibold">
                          {e.correctCount}/{e.questionCount} right
                        </span>
                        <span className="block text-muted-foreground">
                          {new Date(e.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })},{' '}
                          {e.filters.moduleSlugs.length
                            ? e.filters.moduleSlugs.map((s) => s.toUpperCase()).join(', ')
                            : 'all modules'}
                        </span>
                      </span>
                      {e.autoSubmitted ? <ModuleTag code="Timed out" hue={25} /> : null}
                    </Link>
                  </li>
                )
              })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Finished exams and their scores will show up here.</p>
        )}
      </aside>
    </div>
  )
}
