import { useIsMutating, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { BookmarkIcon, RotateCcwIcon, ThumbsUpIcon } from 'lucide-react'
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
import { completeSession, recordAnswer, toggleBookmark } from '#/server/study.functions'

import { FocusHeader, SessionProgress } from './focus-header'

type SessionData = Awaited<ReturnType<NonNullable<ReturnType<typeof sessionQuery>['queryFn']>>>
type Item = SessionData['items'][number]

const MODE_TITLE = { flashcards: 'Flashcards', practice: 'Practice', review: 'Review' } as const
const REQUEUE_GAP = 4

export function SessionRunner({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(sessionQuery(sessionId))
  const mode = data.session.mode as keyof typeof MODE_TITLE
  const record = useServerFn(recordAnswer)
  const bookmark = useServerFn(toggleBookmark)
  const complete = useServerFn(completeSession)

  // Queue of positions to show. Starts at the first unanswered item so a
  // refresh resumes where you left off.
  const [queue, setQueue] = useState<number[]>(() => data.items.filter((i) => !i.answeredAt).map((i) => i.position))
  const [cursor, setCursor] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const requeued = useRef(new Set<number>())
  const shownAt = useRef(Date.now())

  const byPosition = useMemo(() => new Map(data.items.map((i) => [i.position, i])), [data.items])
  const position = queue[cursor]
  const item = position === undefined ? undefined : byPosition.get(position)
  const isRepeat = item ? cursor > 0 && queue.indexOf(item.position) < cursor : false

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per card when the cursor moves
  useEffect(() => {
    shownAt.current = Date.now()
    setFlipped(false)
  }, [cursor])

  const finished = queue.length === 0 || cursor >= queue.length
  // Wait for in-flight answer saves so the summary counts the last one.
  const saving = useIsMutating({ mutationKey: ['record-answer', sessionId] }) > 0
  useEffect(() => {
    if (finished && !saving) {
      invalidateProgress(qc)
      qc.removeQueries({ queryKey: ['session', sessionId, 'summary'] })
      navigate({ to: '/study/$sessionId/summary', params: { sessionId }, replace: true })
    }
  }, [finished, saving, navigate, qc, sessionId])

  const patchItem = (pos: number, patch: Partial<Item>) =>
    qc.setQueryData(sessionQuery(sessionId).queryKey, (old) =>
      old ? { ...old, items: old.items.map((i) => (i.position === pos ? { ...i, ...patch } : i)) } : old,
    )

  const answerMutation = useMutation({
    mutationKey: ['record-answer', sessionId],
    mutationFn: record,
    onError: (error, variables) => {
      patchItem(variables.data.position, { selectedKey: null, isCorrect: null, answeredAt: null })
      toast.error('Your answer wasn’t saved', {
        description: error.message,
        action: { label: 'Try again', onClick: () => answerMutation.mutate(variables) },
      })
    },
  })

  const bookmarkMutation = useMutation({
    mutationFn: bookmark,
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

  const next = () => {
    if (mode === 'flashcards') return
    if (answered) setCursor((c) => c + 1)
  }

  const toggleMark = () => {
    if (q) bookmarkMutation.mutate({ data: { questionId: q.id, bookmarked: !q.bookmarked } })
  }

  const exit = async () => {
    await complete({ data: { id: sessionId } }).catch(() => undefined)
    invalidateProgress(qc)
    navigate({ to: '/study/$sessionId/summary', params: { sessionId } })
  }

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
    ArrowRight: next,
  })

  if (!item || !q) return null
  const answeredCount = results.filter((r) => r !== null).length

  return (
    <div data-module style={moduleStyle(q.module.accentHue)} className="min-h-dvh pb-16">
      <FocusHeader
        onExit={exit}
        title={
          <>
            {MODE_TITLE[mode]}{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {Math.min(answeredCount + (answered ? 0 : 1), data.items.length)} of {data.items.length}
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
        progress={<SessionProgress results={results} current={item.position} />}
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
              <>
                <RationalePanel
                  question={q}
                  answerKey={q.answerKey}
                  rationale={q.rationale}
                  mnemonic={q.mnemonic}
                  verdict={item.isCorrect ? 'correct' : 'incorrect'}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="hidden gap-4 text-sm text-muted-foreground [@media(hover:hover)]:flex">
                    <span>
                      <Kbd>Enter</Kbd> next
                    </span>
                    <span>
                      <Kbd>B</Kbd> bookmark
                    </span>
                  </p>
                  <Button size="lg" className="ml-auto" onClick={next} autoFocus>
                    {cursor + 1 >= queue.length ? 'See results' : 'Next question'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="hidden text-sm text-muted-foreground [@media(hover:hover)]:block">
                Press <Kbd>1</Kbd>–<Kbd>{q.choices.length}</Kbd> to answer
              </p>
            )}
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
