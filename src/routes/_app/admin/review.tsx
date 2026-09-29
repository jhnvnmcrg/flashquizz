import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'

import { Markdown } from '#/components/question/markdown'
import { ModuleTag } from '#/components/question/module-tag'
import { FLAG_LABELS, QUESTION_FLAGS, type QuestionFlag } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'
import { reviewQueueQuery } from '#/queries'

export const Route = createFileRoute('/_app/admin/review')({
  validateSearch: z.object({ flag: z.enum(QUESTION_FLAGS).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ flag: search.flag }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(reviewQueueQuery(deps.flag)),
  component: ReviewQueuePage,
})

function ReviewQueuePage() {
  const { flag } = Route.useSearch()
  const { data } = useSuspenseQuery(reviewQueueQuery(flag))
  const total = data.flagCounts.reduce((s, f) => s + f.n, 0)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Needs review</h2>
        <p className="text-muted-foreground">
          Imported questions the extraction couldn’t settle: a missing or conflicting answer, a lost image, or a suspect
          correction. They stay out of study sessions until you set them to Verified.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/review"
          search={{}}
          className={cn('rounded-full border px-3 py-1 text-sm font-semibold', !flag && 'border-foreground bg-foreground text-background')}
        >
          All ({data.items.length && !flag ? data.items.length : total ? '…' : 0})
        </Link>
        {data.flagCounts
          .sort((a, b) => b.n - a.n)
          .map((f) => (
            <Link
              key={f.flag}
              to="/admin/review"
              search={{ flag: f.flag as QuestionFlag }}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-semibold',
                flag === f.flag && 'border-foreground bg-foreground text-background',
              )}
            >
              {FLAG_LABELS[f.flag as QuestionFlag] ?? f.flag} ({f.n})
            </Link>
          ))}
      </div>
      {data.items.length ? (
        <ul className="divide-y rounded-2xl border bg-card">
          {data.items.map((q) => (
            <li key={q.id}>
              <Link
                to="/admin/questions/$questionId"
                params={{ questionId: String(q.id) }}
                className="flex flex-col gap-1.5 px-4 py-3 hover:bg-accent/40 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-44">
                  <ModuleTag code={q.moduleCode} hue={q.accentHue} />
                  <span className="text-xs text-muted-foreground tabular-nums">{q.sourceRef}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Markdown inline className="line-clamp-2 text-[0.95rem] font-medium">
                    {q.stem}
                  </Markdown>
                  {q.reviewNote ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{q.reviewNote}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1 sm:w-56 sm:justify-end">
                  {q.flags.map((f) => (
                    <span key={f} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                      {FLAG_LABELS[f as QuestionFlag] ?? f}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Nothing left to review.</p>
      )}
    </div>
  )
}
