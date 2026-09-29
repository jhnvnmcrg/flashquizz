import type { ReactNode } from 'react'

import type { QuestionView as QuestionData } from '#/server/question-payload.server'
import { cn } from '#/lib/utils'

import { Markdown } from './markdown'
import { ModuleTag } from './module-tag'
import { ImageRow } from './question-image'

/** Emphasise EXCEPT / NOT / LEAST so the twist in the stem is hard to miss. */
function emphasiseTwist(stem: string) {
  return stem.replace(/(?<![*\w])(EXCEPT|NOT|LEAST|FALSE|INCORRECT)(?![*\w])/g, '**$1**')
}

export function QuestionMeta({ question, trailing }: { question: QuestionData; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
      <ModuleTag code={question.module.code} hue={question.module.accentHue} />
      {question.topic ? <span className="font-medium text-foreground/80">{question.topic}</span> : null}
      <span className="ml-auto flex items-center gap-2">{trailing}</span>
    </div>
  )
}

export function QuestionBody({
  question,
  size = 'lg',
  className,
}: {
  question: QuestionData
  size?: 'lg' | 'md'
  className?: string
}) {
  const stemImages = question.images.filter((i) => i.role === 'stem')
  return (
    <div className={cn('space-y-4', className)}>
      {question.context ? (
        <div className="rounded-md border-l-4 border-module bg-module-soft px-4 py-3 text-[0.95rem]">
          <p className="mb-1 text-xs font-semibold text-module-foreground">Shared by the next few items</p>
          <Markdown inline>{question.context}</Markdown>
        </div>
      ) : null}
      <Markdown
        inline
        className={cn(
          'font-medium leading-relaxed text-foreground',
          size === 'lg' ? 'text-lg sm:text-xl' : 'text-base',
        )}
      >
        {question.format === 'except' ? emphasiseTwist(question.stem) : question.stem}
      </Markdown>
      {question.statements.length ? (
        <ol className="space-y-2">
          {question.statements.map((s) => (
            <li key={s.label} className="flex gap-3 rounded-md border bg-card px-3 py-2.5">
              <span className="w-7 shrink-0 font-bold text-module-foreground">{s.label}.</span>
              <Markdown inline className="text-[0.975rem]">
                {s.text}
              </Markdown>
            </li>
          ))}
        </ol>
      ) : null}
      <ImageRow images={stemImages} />
    </div>
  )
}
