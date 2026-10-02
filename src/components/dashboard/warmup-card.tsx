import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'

import { ChoiceList } from '#/components/question/choice-list'
import { moduleStyle } from '#/components/question/module-tag'
import { QuestionBody, QuestionMeta } from '#/components/question/question-view'
import { RationalePanel } from '#/components/question/rationale-panel'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { invalidateProgress, warmupQuery } from '#/queries'
import { answerLoose } from '#/offline/api'

/** One live question on the dashboard — the fastest way to start. */
export function WarmupCard() {
  const qc = useQueryClient()
  const [skip, setSkip] = useState<number[]>([])
  const [picked, setPicked] = useState<ChoiceKey | null>(null)
  const { data: q, isPending } = useQuery(warmupQuery(skip))
  const answer = answerLoose
  const mutation = useMutation({
    mutationFn: answer,
    onSuccess: () => invalidateProgress(qc),
    onError: (e) => toast.error('Answer not saved', { description: e.message }),
  })

  if (isPending) {
    return (
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!q) {
    return (
      <div className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-bold">No questions yet</h2>
        <p className="mt-1 text-muted-foreground">
          Import the reviewer with <code className="rounded bg-secondary px-1">npm run db:seed</code>, or add one in the
          question bank.
        </p>
      </div>
    )
  }

  const choose = (key: ChoiceKey) => {
    if (picked) return
    setPicked(key)
    mutation.mutate({ data: { questionId: q.id, selectedKey: key } })
  }
  const another = () => {
    setPicked(null)
    setSkip((s) => [...s.slice(-40), q.id])
  }

  return (
    <div data-module style={moduleStyle(q.module.accentHue)} className="space-y-4">
      <section aria-label="Warm-up question" className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
        <QuestionMeta question={q} trailing={<span className="text-xs">Warm-up</span>} />
        <QuestionBody question={q} />
        <ChoiceList
          choices={q.choices}
          images={q.images}
          selectedKey={picked}
          answerKey={picked ? q.answerKey : null}
          onSelect={choose}
          disabled={!!picked}
          showShortcuts={false}
        />
      </section>
      {picked ? (
        <>
          <RationalePanel
            question={q}
            answerKey={q.answerKey}
            rationale={q.rationale}
            mnemonic={q.mnemonic}
            verdict={picked === q.answerKey ? 'correct' : 'incorrect'}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          />
          <Button variant="outline" onClick={another}>
            Another question
          </Button>
        </>
      ) : null}
    </div>
  )
}
