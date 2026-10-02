import { useIsMutating, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { BookmarkIcon, ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon, ThumbsUpIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ChoiceList } from '#/components/question/choice-list'
import { moduleStyle } from '#/components/question/module-tag'
import { QuestionBody, QuestionMeta } from '#/components/question/question-view'
import { RationalePanel } from '#/components/question/rationale-panel'
import { Button } from '#/components/ui/button'
import { Kbd } from '#/components/ui/kbd'
import { choiceShortcut, useKeyboardShortcuts } from '#/hooks/use-keyboard-shortcuts'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'
import { invalidateProgress, sessionQuery } from '#/queries'
import { completeSession, recordAnswer, toggleBookmark } from '#/offline/api'

import { FocusHeader, SessionProgress } from './focus-header'

type SessionData = Awaited<ReturnType<NonNullable<ReturnType<typeof sessionQuery>['queryFn']>>>
type Item = SessionData['items'][number]

const MODE_TITLE = { flashcards: 'Flashcards', practice: 'Practice', review: 'Review' } as const
const REQUEUE_GAP = 4

/**
 * Practice and review resume after the most recently answered question, or
 * wrap round to the skipped ones when nothing is left after it.
 */
function resumePoint(items: Item[]) {
  let last = -1
  let lastAt = 0
  items.forEach((item, index) => {
    const at = item.answeredAt ? new Date(item.answeredAt).getTime() : 0
    if (at > lastAt) {
      last = index
      lastAt = at
    }
  })
  const after = items.findIndex((item, index) => index > last && !item.answeredAt)
  if (after >= 0) return { cursor: after, wrapped: false }
  const first = items.findIndex((item) => !item.answeredAt)
  return { cursor: first >= 0 ? first : items.length, wrapped: true }
}

export function SessionRunner({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(sessionQuery(sessionId))
  const mode = data.session.mode as keyof typeof MODE_TITLE

  // Flashcards work through a queue of the unanswered cards ("Again" re-queues
  // one). Practice and review page through every question in order, so you can
  // skip ahead and go back.
  const linear = mode !== 'flashcards'
  const [start] = useState(() => (linear ? resumePoint(data.items) : { cursor: 0, wrapped: false }))
  const [queue, setQueue] = useState<number[]>(() =>
    (linear ? data.items : data.items.filter((i) => !i.answeredAt)).map((i) => i.position),
  )
  const [cursor, setCursor] = useState(start.cursor)
  // Once past the last question, Next and Skip hop between the skipped ones.
  const [wrapped, setWrapped] = useState(start.wrapped)
  // 'exit' is the X button; 'finish' is finishing from the skipped screen.
  const [done, setDone] = useState<'exit' | 'finish' | null>(null)
  const [flipped, setFlipped] = useState(false)
  const requeued = useRef(new Set<number>())
  const shownAt = useRef(Date.now())
  // Only a set answered in this visit earns the celebration on the summary.
  const answeredHere = useRef(false)

  const byPosition = useMemo(() => new Map(data.items.map((i) => [i.position, i])), [data.items])
  const position = queue[cursor]
  const item = position === undefined ? undefined : byPosition.get(position)
  const isRepeat = item ? cursor > 0 && queue.indexOf(item.position) < cursor : false

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per card when the cursor moves
  useEffect(() => {
    shownAt.current = Date.now()
    setFlipped(false)
  }, [cursor])

  const allAnswered = data.items.every((i) => i.answeredAt)
  const pastEnd = cursor >= queue.length
  // Practice stays on the end screen while skipped questions remain.
  const finished = done !== null || (pastEnd && (!linear || allAnswered))
  // Wait for in-flight answer saves so the summary counts the last one.
  const saving = useIsMutating({ mutationKey: ['record-answer', sessionId] }) > 0
  const leaving = useRef(false)
  useEffect(() => {
    if (!finished || saving || leaving.current) return
    leaving.current = true
    const celebrate = answeredHere.current && done !== 'exit'
    // Answering the last question closes the session; leaving early has to.
    const close = allAnswered ? Promise.resolve() : completeSession({ data: { id: sessionId } }).catch(() => undefined)
    close.then(() => {
      invalidateProgress(qc)
      qc.removeQueries({ queryKey: ['session', sessionId, 'summary'] })
      navigate({ to: '/study/$sessionId/summary', params: { sessionId }, replace: true, state: { celebrate } })
    })
  }, [finished, done, saving, allAnswered, navigate, qc, sessionId])

  const patchItem = (pos: number, patch: Partial<Item>) =>
    qc.setQueryData(sessionQuery(sessionId).queryKey, (old) =>
      old ? { ...old, items: old.items.map((i) => (i.position === pos ? { ...i, ...patch } : i)) } : old,
    )

  const answerMutation = useMutation({
    mutationKey: ['record-answer', sessionId],
    mutationFn: recordAnswer,
    onError: (error, variables) => {
      patchItem(variables.data.position, { selectedKey: null, isCorrect: null, answeredAt: null })
      toast.error('Your answer wasn’t saved', {
        description: error.message,
        action: { label: 'Try again', onClick: () => answerMutation.mutate(variables) },
      })
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: toggleBookmark,
    onMutate: ({ data: v }) => {
      qc.setQueryData(sessionQuery(sessionId).queryKey, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.question.id === v.questionId ? { ...i, question: { ...i.question, bookmarked: v.bookmarked } } : i,
              ),
            }
          : old,
      )
    },
    onSuccess: (res) => {
      toast.success(res.bookmarked ? 'Bookmarked — it’s in your review deck' : 'Bookmark removed')
      invalidateProgress(qc)
    },
    onError: (e) => toast.error('Bookmark wasn’t saved', { description: e.message }),
  })

  // No early return before the hooks below: `item` is undefined once the last
  // card is done (the effect above then navigates to the summary).
  const q = item?.question
  const answered = !!item?.answeredAt
  const results = data.items.map((i) => (i.answeredAt ? !!i.isCorrect : null))

  const choose = (key: ChoiceKey) => {
    if (!item || !q || answered || mode === 'flashcards') return
    const isCorrect = key === q.answerKey
    answeredHere.current = true
    patchItem(item.position, { selectedKey: key, isCorrect, answeredAt: new Date() })
    answerMutation.mutate({
      data: {
        sessionId,
        position: item.position,
        selectedKey: key,
        responseMs: Date.now() - shownAt.current,
      },
    })
  }

  const grade = (grade: 'again' | 'got_it') => {
    if (!item || !flipped) return
    if (!answered) {
      answeredHere.current = true
      patchItem(item.position, { isCorrect: grade === 'got_it', answeredAt: new Date() })
      answerMutation.mutate({
        data: {
          sessionId,
          position: item.position,
          selectedKey: null,
          selfGrade: grade,
          responseMs: Date.now() - shownAt.current,
        },
      })
    }
    if (grade === 'again' && !requeued.current.has(item.position)) {
      requeued.current.add(item.position)
      setQueue((qs) => {
        const next = qs.slice()
        next.splice(Math.min(cursor + 1 + REQUEUE_GAP, next.length), 0, item.position)
        return next
      })
    }
    setCursor((c) => c + 1)
  }

  // Where Next / Skip lands: the following question, or once wrapped the next
  // skipped one. `queue.length` is the end.
  const forwardTarget = (() => {
    if (cursor + 1 >= queue.length) return queue.length
    if (!wrapped) return cursor + 1
    const skipped = data.items.findIndex((i, index) => index > cursor && !i.answeredAt)
    return skipped >= 0 ? skipped : queue.length
  })()

  const forward = () => {
    if (!linear || pastEnd) return
    if (forwardTarget >= queue.length) setWrapped(true)
    setCursor(forwardTarget)
  }

  const back = () => {
    if (linear && cursor > 0) setCursor(Math.min(cursor, queue.length) - 1)
  }

  const answerSkipped = () => {
    const first = data.items.findIndex((i) => !i.answeredAt)
    if (first >= 0) setCursor(first)
  }

  const next = () => {
    if (!linear) return
    if (pastEnd) answerSkipped()
    else if (answered) forward()
  }

  const toggleMark = () => {
    if (q) bookmarkMutation.mutate({ data: { questionId: q.id, bookmarked: !q.bookmarked } })
  }

  const exit = () => setDone('exit')

  useKeyboardShortcuts({
    ...Object.fromEntries(
      ['1', '2', '3', '4', '5', 'a', 'c', 'd', 'e'].map((k) => [
        k,
        () => {
          if (mode === 'flashcards') {
            if (flipped && k === '1') grade('again')
            else if (flipped && k === '2') grade('got_it')
            return
          }
          const key = choiceShortcut(k)
          if (key && q?.choices.some((c) => c.key === key)) choose(key)
        },
      ]),
    ),
    // `b` is bookmark, so B is chosen with 2 (or a click) — same as the hint shown.
    b: toggleMark,
    ' ': () => (mode === 'flashcards' ? (!flipped ? setFlipped(true) : undefined) : next()),
    Enter: () => (mode === 'flashcards' ? (!flipped ? setFlipped(true) : undefined) : next()),
    ArrowRight: forward,
    ArrowLeft: back,
  })

  const answeredCount = results.filter((r) => r !== null).length

  if (!item || !q) {
    // Practice past the last question with some skipped: offer to go back to them.
    if (finished || !linear) return null
    const skipped = data.items.length - answeredCount
    return (
      <div className="min-h-dvh pb-16">
        <FocusHeader
          onExit={exit}
          title={MODE_TITLE[mode]}
          progress={<SessionProgress results={results} current={-1} />}
        />
        <main className="mx-auto w-full max-w-3xl px-4 pt-6">
          <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-bold">
                {skipped} question{skipped === 1 ? '' : 's'} skipped
              </h1>
              <p className="text-muted-foreground">
                You’ve answered {answeredCount} of {data.items.length}. Go back to the skipped{' '}
                {skipped === 1 ? 'one' : 'ones'}, or finish now — skipped questions don’t count toward your score.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="lg" onClick={back}>
                <ChevronLeftIcon /> Back
              </Button>
              <Button variant="ghost" size="lg" className="ml-auto" onClick={() => setDone('finish')}>
                Finish anyway
              </Button>
              <Button size="lg" onClick={answerSkipped} autoFocus>
                Answer skipped
              </Button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const shownNumber = linear ? cursor + 1 : Math.min(answeredCount + (answered ? 0 : 1), data.items.length)
  const atEnd = forwardTarget >= queue.length
  const forwardLabel = !answered ? 'Next' : !atEnd ? 'Next question' : allAnswered ? 'See results' : 'Finish'

  return (
    <div data-module style={moduleStyle(q.module.accentHue)} className="min-h-dvh pb-16">
      <FocusHeader
        onExit={exit}
        title={
          <>
            {MODE_TITLE[mode]}{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {shownNumber} of {data.items.length}
            </span>
          </>
        }
        actions={
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={q.bookmarked}
            aria-label={q.bookmarked ? 'Remove bookmark' : 'Bookmark this question'}
            onClick={toggleMark}
          >
            <BookmarkIcon className={cn(q.bookmarked && 'fill-primary text-primary')} />
          </Button>
        }
        progress={<SessionProgress results={results} current={data.items.indexOf(item)} />}
      />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6">
        {mode === 'flashcards' ? (
          <FlashCard
            key={`${item.position}-${cursor}`}
            item={item}
            flipped={flipped}
            onFlip={() => setFlipped(true)}
            onGrade={grade}
            isRepeat={isRepeat}
          />
        ) : (
          <div className="space-y-6">
            <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
              <QuestionMeta question={q} />
              <QuestionBody question={q} />
              <ChoiceList
                choices={q.choices}
                images={q.images}
                selectedKey={item.selectedKey}
                answerKey={answered ? q.answerKey : null}
                onSelect={choose}
                disabled={answered}
              />
            </div>
            {answered ? (
              <RationalePanel
                question={q}
                answerKey={q.answerKey}
                rationale={q.rationale}
                mnemonic={q.mnemonic}
                verdict={item.isCorrect ? 'correct' : 'incorrect'}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
              />
            ) : null}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" onClick={back} disabled={cursor === 0}>
                <ChevronLeftIcon /> Back
              </Button>
              <p className="hidden flex-1 justify-center gap-4 text-sm text-muted-foreground sm:[@media(hover:hover)]:flex">
                {answered ? (
                  <>
                    <span>
                      <Kbd>Enter</Kbd> next
                    </span>
                    <span>
                      <Kbd>B</Kbd> bookmark
                    </span>
                  </>
                ) : (
                  <span>
                    <Kbd>1</Kbd>–<Kbd>{q.choices.length}</Kbd> answer
                  </span>
                )}
                <span>
                  <Kbd>←</Kbd> <Kbd>→</Kbd> move
                </span>
              </p>
              {/* Keyed on `answered` so Next takes focus as soon as you answer. */}
              <Button
                key={answered ? 'next' : 'skip'}
                size="lg"
                variant={answered ? 'default' : 'outline'}
                className="ml-auto"
                onClick={forward}
                autoFocus={answered}
              >
                {forwardLabel} <ChevronRightIcon />
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function FlashCard({
  item,
  flipped,
  onFlip,
  onGrade,
  isRepeat,
}: {
  item: Item
  flipped: boolean
  onFlip: () => void
  onGrade: (g: 'again' | 'got_it') => void
  isRepeat: boolean
}) {
  const q = item.question
  return (
    <div className="space-y-5">
      <div className="perspective-[1800px]">
        <div
          className={cn(
            'grid transition-transform duration-500 transform-3d [&>*]:[grid-area:1/1] motion-reduce:transition-none',
            flipped && 'rotate-y-180',
          )}
        >
          <section
            aria-hidden={flipped}
            className={cn(
              'space-y-5 rounded-2xl border bg-card p-5 shadow-md backface-hidden sm:p-6',
              flipped && 'invisible motion-safe:visible',
            )}
          >
            <QuestionMeta
              question={q}
              trailing={isRepeat ? <span className="text-xs font-semibold text-info">Again</span> : null}
            />
            <QuestionBody question={q} />
            <ChoiceList choices={q.choices} images={q.images} selectedKey={null} showShortcuts={false} disabled />
          </section>
          <section
            aria-hidden={!flipped}
            className={cn('rotate-y-180 backface-hidden', !flipped && 'invisible motion-safe:visible')}
          >
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
                <QuestionBody question={q} size="md" />
              </div>
              <RationalePanel question={q} answerKey={q.answerKey} rationale={q.rationale} mnemonic={q.mnemonic} />
            </div>
          </section>
        </div>
      </div>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="outline" onClick={() => onGrade('again')} autoFocus>
            <RotateCcwIcon /> Again
            <Kbd className="ml-1 hidden [@media(hover:hover)]:inline-flex">1</Kbd>
          </Button>
          <Button size="lg" onClick={() => onGrade('got_it')}>
            <ThumbsUpIcon /> Got it
            <Kbd className="ml-1 hidden bg-primary-foreground/20 text-primary-foreground [@media(hover:hover)]:inline-flex">
              2
            </Kbd>
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={onFlip} autoFocus>
          Show answer
          <Kbd className="ml-1 hidden bg-primary-foreground/20 text-primary-foreground [@media(hover:hover)]:inline-flex">
            Space
          </Kbd>
        </Button>
      )}
    </div>
  )
}
