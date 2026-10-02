import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Celebration, type CelebrationKind, useArrivalCelebration } from '#/components/celebrate/celebration'
import { Markdown } from '#/components/question/markdown'
import { ModuleTag } from '#/components/question/module-tag'
import { Button } from '#/components/ui/button'
import { sessionSummaryQuery } from '#/queries'
import { startSession } from '#/offline/api'

export const Route = createFileRoute('/_app/study/$sessionId/summary')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(sessionSummaryQuery(params.sessionId)),
  head: () => ({ meta: [{ title: 'Session results · FlashQuizz' }] }),
  component: SummaryPage,
})

const MODE_NAME: Record<string, string> = {
  flashcards: 'Flashcards',
  practice: 'Practice',
  review: 'Review',
  exam: 'Mock exam',
}

function SummaryPage() {
  const { sessionId } = Route.useParams()
  const { data } = useSuspenseQuery(sessionSummaryQuery(sessionId))
  const navigate = useNavigate()
  const start = startSession
  const retry = useMutation({
    mutationFn: start,
    onSuccess: ({ id }) => navigate({ to: '/study/$sessionId', params: { sessionId: id } }),
    onError: (e) => toast.error(e.message),
  })
  const [celebrating, setCelebrating] = useArrivalCelebration()

  const { session } = data
  const pct = session.answeredCount ? Math.round((session.correctCount / session.answeredCount) * 100) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {session.answeredCount > 0 ? (
        <Celebration
          open={celebrating}
          onOpenChange={setCelebrating}
          kind={session.mode as CelebrationKind}
          correct={session.correctCount}
          total={session.answeredCount}
          missed={data.missed.length}
          hues={data.hues}
        />
      ) : null}
      <section className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">{MODE_NAME[session.mode]} finished</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {session.correctCount} of {session.answeredCount} right
          <span className="ml-3 text-xl font-bold text-muted-foreground tabular-nums">{pct}%</span>
        </h1>
        {session.answeredCount < session.questionCount ? (
          <p className="text-muted-foreground">
            You stopped after {session.answeredCount} of {session.questionCount} questions.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        {data.missed.length ? (
          <Button
            size="lg"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate({
                data: {
                  mode: 'practice',
                  filters: { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all', fromSessionId: sessionId },
                  count: 200,
                  order: 'sequential',
                },
              })
            }
          >
            Retry the {data.missed.length} you missed
          </Button>
        ) : null}
        <Button size="lg" variant="outline" asChild>
          <Link to="/">Back to Today</Link>
        </Button>
      </div>

      {data.topics.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">By topic</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {data.topics.map((t) => {
              const p = Math.round((t.correct / t.answered) * 100)
              return (
                <li key={t.name} className="flex items-center gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <div className="hidden h-2 w-32 overflow-hidden rounded-r-[4px] bg-secondary sm:block" aria-hidden>
                    <div className="h-full rounded-r-[4px] bg-chart-1" style={{ width: `${p}%` }} />
                  </div>
                  <span className="w-20 text-right text-sm tabular-nums">
                    {t.correct}/{t.answered}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {data.missed.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Missed questions</h2>
          <p className="text-sm text-muted-foreground">These are now in your review deck and will come back tomorrow.</p>
          <ol className="space-y-2">
            {data.missed.map((m) => (
              <li key={m.position} className="flex gap-3 rounded-xl border bg-card px-4 py-3">
                <ModuleTag code={m.moduleCode} hue={m.accentHue} className="h-fit shrink-0" />
                <Markdown inline className="line-clamp-2 text-[0.95rem]">
                  {m.stem}
                </Markdown>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
