import { LightbulbIcon } from 'lucide-react'

import type { ChoiceKey } from '#/lib/schemas/enums'
import type { QuestionView } from '#/lib/question-view'
import { cn } from '#/lib/utils'

import { Markdown } from './markdown'
import { ImageRow } from './question-image'

/**
 * The answer + rationale, styled like a dispensing label: module-coloured
 * band, the answer letter set large, a perforated divider, then the notes.
 */
export function RationalePanel({
  question,
  answerKey,
  rationale,
  mnemonic,
  verdict,
  className,
}: {
  question: QuestionView
  answerKey: ChoiceKey
  rationale: string
  mnemonic: string
  verdict?: 'correct' | 'incorrect' | 'unanswered' | null
  className?: string
}) {
  const answer = question.choices.find((c) => c.key === answerKey)
  const images = question.images.filter((i) => i.role === 'rationale')
  return (
    <section
      aria-label="Answer and rationale"
      className={cn('overflow-hidden rounded-2xl border border-module-line bg-card shadow-sm', className)}
    >
      <div aria-hidden className="h-1.5 bg-module" />
      <div className="flex items-start gap-4 px-5 pt-4 pb-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-module-soft text-3xl font-extrabold text-module-foreground">
          {answerKey}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Answer</p>
          <Markdown inline className="text-lg font-semibold leading-snug">
            {answer?.text ?? ''}
          </Markdown>
        </div>
        {verdict === 'correct' ? (
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">You got it</span>
        ) : verdict === 'incorrect' ? (
          <span className="rounded-full bg-destructive-soft px-2.5 py-1 text-xs font-bold text-destructive">
            Not quite
          </span>
        ) : verdict === 'unanswered' ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">
            Skipped
          </span>
        ) : null}
      </div>
      <div aria-hidden className="mx-5 border-t-2 border-dashed border-module-line" />
      <div className="space-y-4 px-5 pt-3 pb-5">
        {rationale.trim() ? (
          <Markdown className="text-[0.975rem] leading-relaxed">{rationale}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">
            The source has no rationale for this item. Add one from the question bank.
          </p>
        )}
        <ImageRow images={images} />
        {mnemonic.trim() ? (
          <aside className="rounded-lg border border-warning/50 bg-warning-soft px-4 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-warning-foreground">
              <LightbulbIcon className="size-4" aria-hidden />
              Remember
            </p>
            <Markdown inline className="text-[0.95rem] text-warning-foreground">
              {mnemonic}
            </Markdown>
          </aside>
        ) : null}
        <p className="text-xs text-muted-foreground">
          From {question.source}
          {question.printedNumber ? `, item ${question.printedNumber}` : ''}
        </p>
      </div>
    </section>
  )
}
