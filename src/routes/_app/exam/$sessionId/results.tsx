import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { FlagIcon } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Segmented } from '#/components/app/segmented'
import { ChoiceList } from '#/components/question/choice-list'
import { ModuleTag, moduleStyle } from '#/components/question/module-tag'
import { QuestionBody } from '#/components/question/question-view'
import { RationalePanel } from '#/components/question/rationale-panel'
import { Button } from '#/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { examResultQuery } from '#/queries'
import { startSession } from '#/server/study.functions'

const SHOW = ['all', 'wrong', 'unanswered', 'flagged'] as const

export const Route = createFileRoute('/_app/exam/$sessionId/results')({
  validateSearch: z.object({ show: z.enum(SHOW).default('wrong').catch('wrong') }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(examResultQuery(params.sessionId))
    if (data.status === 'active') throw redirect({ to: '/exam/$sessionId', params })
    return data
  },
  head: () => ({ meta: [{ title: 'Exam results · FlashQuizz' }] }),
  component: ResultsPage,
})

function formatDuration(ms: number) {
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

function ResultsPage() {
  const { sessionId } = Route.useParams()
  const { show } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data } = useSuspenseQuery(examResultQuery(sessionId))
  const start = useServerFn(startSession)
  const retry = useMutation({
    mutationFn: start,
    onSuccess: ({ id }) => navigate({ to: '/study/$sessionId', params: { sessionId: id } }),
    onError: (e) => toast.error(e.message),
  })
  if (data.status !== 'completed') return null

  const { session } = data
  const pct = Math.round((session.correctCount / session.questionCount) * 100)
  const unanswered = session.questionCount - session.answeredCount
  const took =
    session.completedAt && session.startedAt
      ? new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
      : 0
  const topics = [...data.topics].sort((a, b) => a.correct / a.total - b.correct / b.total)
  const items = data.items.filter((i) =>
    show === 'wrong'
      ? !i.isCorrect
      : show === 'unanswered'
        ? !i.selectedKey
        : show === 'flagged'
          ? i.flagged
          : true,
  )
  const wrongCount = data.items.filter((i) => !i.isCorrect).length

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-muted-foreground">
            Mock exam {session.autoSubmitted ? 'submitted when time ran out' : 'submitted'}
          </p>
          <p className="mt-1 text-6xl font-extrabold tracking-tight">{pct}%</p>
          <p className="mt-2 text-muted-foreground">
            {session.correctCount} of {session.questionCount} right
            {unanswered ? `, ${unanswered} left blank` : ''}, in {formatDuration(took)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wrongCount ? (
            <Button
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate({
                  data: {
                    mode: 'practice',
                    count: 200,
                    order: 'sequential',
                    filters: { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all', fromSessionId: sessionId },
                  },
                })
              }
            >
              Practice the {wrongCount} you missed
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link to="/exam">New exam</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="topic-heading" className="space-y-3">
        <div>
          <h2 id="topic-heading" className="text-lg font-bold">
            Score by topic
          </h2>
          <p className="text-sm text-muted-foreground">Percent right, weakest first.</p>
        </div>
        <ul className="divide-y rounded-2xl border bg-card">
          {topics.map((t) => {
            const p = Math.round((t.correct / t.total) * 100)
            return (
              <li key={t.key} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-cols-[3.25rem_minmax(0,16rem)_minmax(0,1fr)_4.5rem]">
                <ModuleTag code={t.moduleCode} hue={t.accentHue} className="justify-self-start" />
                <span className="truncate text-sm font-medium">{t.topic}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="col-span-2 flex h-6 items-center sm:col-span-1" role="img" aria-label={`${t.topic}: ${t.correct} of ${t.total} right, ${p}%`}>
                      <div className="h-3 w-full rounded-r-[4px] bg-secondary">
                        {p > 0 ? <div className="h-full rounded-r-[4px] bg-chart-1" style={{ width: `${p}%` }} /> : null}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t.correct} of {t.total} right ({p}%)
                  </TooltipContent>
                </Tooltip>
                <span className="hidden text-right text-sm tabular-nums sm:block">
                  {t.correct}/{t.total}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Answers</h2>
          <Segmented
            label="Show"
            value={show}
            onChange={(v) => navigate({ search: { show: v }, replace: true, resetScroll: false })}
            options={[
              { value: 'wrong', label: `Wrong (${wrongCount})` },
              { value: 'unanswered', label: `Blank (${unanswered})` },
              { value: 'flagged', label: `Flagged (${data.items.filter((i) => i.flagged).length})` },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {items.length ? (
          <ol className="space-y-6">
            {items.map((i) => (
              <li
                key={i.position}
                data-module
                style={moduleStyle(i.question.module.accentHue)}
                className="space-y-4 rounded-2xl border bg-card p-5"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-bold tabular-nums">Item {i.position + 1}</span>
                  <ModuleTag code={i.question.module.code} hue={i.question.module.accentHue} />
                  {i.question.topic ? <span className="text-muted-foreground">{i.question.topic}</span> : null}
                  {i.flagged ? <FlagIcon className="ml-auto size-4 fill-warning text-warning" aria-label="Flagged" /> : null}
                </div>
                <QuestionBody question={i.question} size="md" />
                <ChoiceList
                  choices={i.question.choices}
                  images={i.question.images}
                  selectedKey={i.selectedKey}
                  answerKey={i.question.answerKey}
                  disabled
                />
                <RationalePanel
                  question={i.question}
                  answerKey={i.question.answerKey}
                  rationale={i.question.rationale}
                  mnemonic={i.question.mnemonic}
                  verdict={!i.selectedKey ? 'unanswered' : i.isCorrect ? 'correct' : 'incorrect'}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Nothing here.</p>
        )}
      </section>
    </div>
  )
}
