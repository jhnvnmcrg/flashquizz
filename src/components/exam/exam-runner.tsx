import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ClientOnly, useNavigate } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, FlagIcon, GridIcon, TimerIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ChoiceList } from '#/components/question/choice-list'
import { moduleStyle } from '#/components/question/module-tag'
import { QuestionBody, QuestionMeta } from '#/components/question/question-view'
import { FocusHeader } from '#/components/study/focus-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '#/components/ui/sheet'
import { formatClock, useCountdown } from '#/hooks/use-countdown'
import { choiceShortcut, useKeyboardShortcuts } from '#/hooks/use-keyboard-shortcuts'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { cn } from '#/lib/utils'
import { examQuery, invalidateProgress } from '#/queries'
import { saveExamAnswer, submitExam } from '#/offline/api'

type ExamData = Awaited<ReturnType<NonNullable<ReturnType<typeof examQuery>['queryFn']>>>

function Timer({ data, onExpire }: { data: ExamData; onExpire: () => void }) {
  const left = useCountdown(data.session.expiresAt, data.serverNow, onExpire)
  const warn = left <= 5 * 60_000
  const minutes = Math.ceil(left / 60_000)
  const [announce, setAnnounce] = useState('')
  const last = useRef<number | null>(null)
  useEffect(() => {
    if ([10, 5, 1].includes(minutes) && last.current !== minutes) {
      last.current = minutes
      setAnnounce(`${minutes} minute${minutes === 1 ? '' : 's'} left`)
    }
  }, [minutes])
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums',
        warn ? 'bg-destructive-soft text-destructive' : 'bg-secondary',
      )}
    >
      <TimerIcon className="size-4" aria-hidden />
      {formatClock(left)}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  )
}

export function ExamRunner({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data } = useSuspenseQuery(examQuery(sessionId))
  const save = saveExamAnswer
  const submit = submitExam
  const [index, setIndex] = useState(() => {
    const first = data.items.findIndex((i) => !i.selectedKey)
    return first === -1 ? 0 : first
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const submitted = useRef(false)

  useEffect(() => {
    if (data.session.status !== 'active') {
      navigate({ to: '/exam/$sessionId/results', params: { sessionId }, replace: true })
    }
  }, [data.session.status, navigate, sessionId])

  const patch = (position: number, p: { selectedKey?: ChoiceKey | null; flagged?: boolean }) =>
    qc.setQueryData(examQuery(sessionId).queryKey, (old) =>
      old ? { ...old, items: old.items.map((i) => (i.position === position ? { ...i, ...p } : i)) } : old,
    )

  const saveMutation = useMutation({
    mutationFn: save,
    retry: 3,
    onError: (e) => toast.error('Answer not saved', { description: e.message }),
  })

  const submitMutation = useMutation({
    mutationFn: submit,
    onSuccess: () => {
      invalidateProgress(qc)
      qc.invalidateQueries({ queryKey: ['exams'] })
      navigate({ to: '/exam/$sessionId/results', params: { sessionId }, replace: true, state: { celebrate: true } })
    },
    onError: (e) => {
      submitted.current = false
      toast.error('Couldn’t submit', { description: e.message })
    },
  })

  const doSubmit = () => {
    if (submitted.current) return
    submitted.current = true
    submitMutation.mutate({ data: { id: sessionId } })
  }

  const item = data.items[index]
  const q = item?.question
  const answeredCount = data.items.filter((i) => i.selectedKey).length
  const unanswered = data.items.length - answeredCount
  const flaggedCount = data.items.filter((i) => i.flagged).length

  const choose = (key: ChoiceKey) => {
    if (!item) return
    const next = item.selectedKey === key ? null : key
    patch(item.position, { selectedKey: next })
    saveMutation.mutate({ data: { sessionId, position: item.position, selectedKey: next } })
  }
  const toggleFlag = () => {
    if (!item) return
    patch(item.position, { flagged: !item.flagged })
    saveMutation.mutate({
      data: { sessionId, position: item.position, selectedKey: item.selectedKey, flagged: !item.flagged },
    })
  }
  const go = (i: number) => setIndex(Math.max(0, Math.min(data.items.length - 1, i)))

  useKeyboardShortcuts({
    ...Object.fromEntries(
      ['1', '2', '3', '4', '5', 'a', 'b', 'c', 'd', 'e'].map((k) => [
        k,
        () => {
          const key = choiceShortcut(k)
          if (key && q?.choices.some((c) => c.key === key)) choose(key)
        },
      ]),
    ),
    m: toggleFlag,
    ArrowLeft: () => go(index - 1),
    ArrowRight: () => go(index + 1),
    Enter: () => go(index + 1),
  })

  if (!item || !q) return null

  const navigator = (
    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
      {data.items.map((it, i) => (
        <button
          key={it.position}
          type="button"
          onClick={() => {
            go(i)
            setNavOpen(false)
          }}
          aria-label={`Question ${i + 1}${it.selectedKey ? ', answered' : ''}${it.flagged ? ', flagged' : ''}`}
          aria-current={i === index}
          className={cn(
            'relative flex aspect-square items-center justify-center rounded-md border text-xs font-semibold tabular-nums',
            it.selectedKey ? 'border-info bg-info-soft text-foreground' : 'bg-card text-muted-foreground',
            i === index && 'ring-2 ring-foreground',
          )}
        >
          {i + 1}
          {it.flagged ? <span aria-hidden className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warning" /> : null}
        </button>
      ))}
    </div>
  )

  return (
    <div data-module style={moduleStyle(q.module.accentHue)} className="min-h-dvh pb-28">
      <FocusHeader
        onExit={() => navigate({ to: '/exam' })}
        title={
          <>
            Mock exam{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {answeredCount}/{data.items.length} answered
            </span>
          </>
        }
        actions={
          <ClientOnly fallback={<span className="w-20" />}>
            <Timer data={data} onExpire={doSubmit} />
          </ClientOnly>
        }
      />

      <main className="mx-auto w-full max-w-3xl space-y-5 px-4 pt-6">
        <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-6">
          <QuestionMeta
            question={q}
            trailing={<span className="font-semibold tabular-nums">Item {index + 1}</span>}
          />
          <QuestionBody question={q} />
          <ChoiceList choices={q.choices} images={q.images} selectedKey={item.selectedKey} onSelect={choose} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0}>
            <ChevronLeftIcon /> Previous
          </Button>
          <Button variant={item.flagged ? 'secondary' : 'ghost'} aria-pressed={item.flagged} onClick={toggleFlag}>
            <FlagIcon className={cn(item.flagged && 'fill-warning text-warning')} />
            {item.flagged ? 'Flagged' : 'Flag for later'}
          </Button>
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost">
                <GridIcon /> All items
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Jump to an item</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">{navigator}</div>
            </SheetContent>
          </Sheet>
          {index < data.items.length - 1 ? (
            <Button className="ml-auto" onClick={() => go(index + 1)}>
              Next <ChevronRightIcon />
            </Button>
          ) : (
            <Button className="ml-auto" onClick={() => setConfirmOpen(true)}>
              Review and submit
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-5">
          <p className="text-sm text-muted-foreground tabular-nums">
            {unanswered} unanswered{flaggedCount ? `, ${flaggedCount} flagged` : ''}
          </p>
          <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={submitMutation.isPending}>
            Submit exam
          </Button>
        </div>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your exam?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered
                ? `${unanswered} ${unanswered === 1 ? 'item is' : 'items are'} still unanswered and will count as wrong.`
                : 'Every item is answered.'}{' '}
              You can’t change answers after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Submit exam</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
