import { CheckIcon, XIcon } from 'lucide-react'

import type { ChoiceKey } from '#/lib/schemas/enums'
import type { Choice } from '#/lib/schemas/question'
import type { ImageMeta } from '#/lib/question-view'
import { cn } from '#/lib/utils'

import { Markdown } from './markdown'
import { QuestionImage } from './question-image'

type ChoiceState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed'

function stateOf(key: ChoiceKey, selected: ChoiceKey | null, answer: ChoiceKey | null | undefined): ChoiceState {
  if (answer) {
    if (key === answer) return 'correct'
    if (key === selected) return 'incorrect'
    return 'missed'
  }
  return key === selected ? 'selected' : 'idle'
}

const rowStyles: Record<ChoiceState, string> = {
  idle: 'border-border bg-card hover:border-info/60 hover:bg-info-soft/60',
  selected: 'border-info bg-info-soft ring-1 ring-info/40',
  correct: 'border-success bg-success-soft',
  incorrect: 'border-destructive bg-destructive-soft',
  missed: 'border-border bg-card opacity-70',
}

const tileStyles: Record<ChoiceState, string> = {
  idle: 'border-border bg-secondary text-secondary-foreground',
  selected: 'border-info bg-info text-info-foreground',
  correct: 'border-success bg-success text-success-foreground',
  incorrect: 'border-destructive bg-destructive text-destructive-foreground',
  missed: 'border-border bg-secondary text-muted-foreground',
}

/**
 * A–E answer rows. Pass `answerKey` to reveal: the right answer, the learner's
 * wrong pick, and the rest dimmed. Every state has an icon + text, not only colour.
 */
export function ChoiceList({
  choices,
  images = [],
  selectedKey,
  answerKey,
  onSelect,
  disabled,
  showShortcuts = true,
}: {
  choices: Choice[]
  images?: ImageMeta[]
  selectedKey: ChoiceKey | null
  answerKey?: ChoiceKey | null
  onSelect?: (key: ChoiceKey) => void
  disabled?: boolean
  showShortcuts?: boolean
}) {
  const locked = disabled || !onSelect
  return (
    <div role="radiogroup" aria-label="Answer choices" className="grid gap-2.5">
      {choices.map((choice, i) => {
        const state = stateOf(choice.key, selectedKey, answerKey)
        const choiceImages = images.filter((img) => img.role === 'choice' && img.choiceKey === choice.key)
        return (
          // biome-ignore lint/a11y/useSemanticElements: card-style option; ARIA radio semantics + keyboard shortcuts
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={selectedKey === choice.key}
            disabled={locked}
            onClick={() => onSelect?.(choice.key)}
            className={cn(
              'group flex w-full items-start gap-3 rounded-[10px] border px-3 py-3 text-left transition-colors disabled:cursor-default',
              rowStyles[state],
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md border text-sm font-bold tabular-nums',
                tileStyles[state],
              )}
            >
              {state === 'correct' ? (
                <CheckIcon className="size-4" aria-hidden />
              ) : state === 'incorrect' ? (
                <XIcon className="size-4" aria-hidden />
              ) : (
                choice.key
              )}
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="sr-only">{choice.key}. </span>
              <Markdown inline className="text-[0.975rem] leading-snug">
                {choice.text}
              </Markdown>
              {choiceImages.map((img) => (
                <QuestionImage key={img.id} image={img} className="mt-2" />
              ))}
              {state === 'correct' ? (
                <span className="mt-1 block text-xs font-semibold text-success">Correct answer</span>
              ) : state === 'incorrect' ? (
                <span className="mt-1 block text-xs font-semibold text-destructive">Your answer</span>
              ) : null}
            </span>
            {showShortcuts && !locked ? (
              <kbd className="hidden self-center rounded border bg-background px-1.5 text-[0.7rem] text-muted-foreground [@media(hover:hover)]:inline">
                {i + 1}
              </kbd>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
