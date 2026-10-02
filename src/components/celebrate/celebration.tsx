import { useLocation } from '@tanstack/react-router'
import { SparklesIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'

import { Button } from '#/components/ui/button'

import { Fireworks } from './fireworks'

declare module '@tanstack/history' {
  interface HistoryState {
    /** Set by the session and exam runners when they hand off to the results. */
    celebrate?: boolean
  }
}

/** PhLE pass mark: a 75% general average. */
const PASSING = 75
const MODULE_HUES = [290, 135, 220, 25, 75, 340]
// [rockets, spread over ms, closing volley] by tier
const SHOWS = { 1: [5, 2400, 0], 2: [10, 3400, 5], 3: [16, 4200, 8] } as const

export type CelebrationKind = 'practice' | 'review' | 'flashcards' | 'exam'

/**
 * Opens once when a runner navigated here with `state.celebrate`, then clears
 * the flag so a refresh doesn't replay the show.
 */
export function useArrivalCelebration() {
  const flagged = useLocation({ select: (l) => l.state.celebrate === true })
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!flagged) return
    setOpen(true)
    window.history.replaceState({ ...window.history.state, celebrate: false }, '')
  }, [flagged])
  return [open, setOpen] as const
}

type CelebrationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: CelebrationKind
  correct: number
  /** Denominator for the score: answered items, or every item for an exam. */
  total: number
  missed: number
  /** Accent hues of the modules covered; the fireworks burst in these. */
  hues: number[]
  autoSubmitted?: boolean
}

export function Celebration({ open, onOpenChange, ...props }: CelebrationProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>{open ? <CelebrationBody {...props} /> : null}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const CONTEXT: Record<CelebrationKind, string> = {
  practice: 'Practice finished',
  review: 'Review finished',
  flashcards: 'Flashcards finished',
  exam: 'Mock exam submitted',
}

function headline(pct: number, kind: CelebrationKind) {
  if (pct === 100) return 'Perfect score!'
  if (pct >= 90) return 'Outstanding!'
  if (pct >= PASSING) return 'That’s a passing score!'
  if (pct >= 50) return 'Nice effort!'
  return kind === 'exam' ? 'You finished the exam!' : 'You finished the set!'
}

function CelebrationBody({ kind, correct, total, missed, hues, autoSubmitted }: Omit<CelebrationProps, 'open' | 'onOpenChange'>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<Fireworks | null>(null)
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const pct = total ? Math.round((correct / total) * 100) : 0
  const tier = pct >= 90 ? 3 : pct >= PASSING ? 2 : 1
  const hueKey = hues.join(',')

  useEffect(() => {
    if (reduced || !canvas.current) return
    const own = hueKey ? hueKey.split(',').map(Number) : MODULE_HUES
    // The session's own modules lead; the rest of the palette adds variety.
    const fw = new Fireworks(canvas.current, [...own, ...own, ...own, ...MODULE_HUES])
    engine.current = fw
    fw.launch()
    return () => {
      fw.destroy()
      engine.current = null
    }
  }, [reduced, hueKey])

  const startShow = () => {
    const [count, span, finale] = SHOWS[tier]
    engine.current?.show(count, span, finale)
  }

  const note =
    pct >= PASSING
      ? `You’re above the ${PASSING}% passing mark.`
      : missed > 0
        ? kind === 'exam'
          ? `Practice the ${missed} you missed to push past ${PASSING}%.`
          : missed === 1
            ? 'The one you missed is in your review deck.'
            : `The ${missed} you missed are in your review deck.`
        : null

  return (
    <>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.17_0.035_252/0.95)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
        {reduced ? null : (
          <p className="pointer-events-none absolute inset-x-0 top-5 px-4 text-center text-sm text-white/65">
            Tap anywhere for more fireworks
          </p>
        )}
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content
        onPointerDownOutside={(event) => {
          // The sky is the launch pad, not a dismiss target.
          event.preventDefault()
          const { clientX, clientY } = event.detail.originalEvent
          engine.current?.launch(clientX, clientY)
        }}
        className="fixed bottom-[max(1rem,6vh)] left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 overflow-hidden rounded-2xl border bg-card text-center shadow-2xl outline-none duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-6"
      >
        <div aria-hidden className="h-1.5 bg-primary" />
        <div className="space-y-5 px-6 pt-5 pb-6">
          <p className="text-sm text-muted-foreground">
            {kind === 'exam' && autoSubmitted ? 'Time’s up, mock exam submitted' : CONTEXT[kind]}
          </p>
          <ScoreRing pct={pct} animate={!reduced} onDone={startShow} />
          <div className="space-y-1.5">
            <DialogPrimitive.Title className="text-2xl font-extrabold tracking-tight text-balance">
              {headline(pct, kind)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-pretty text-muted-foreground">
              {kind === 'flashcards' ? `You knew ${correct} of ${total}.` : `${correct} of ${total} right.`}
              {note ? ` ${note}` : null}
            </DialogPrimitive.Description>
          </div>
          <div aria-hidden className="border-t-2 border-dashed" />
          <div className={reduced ? 'grid' : 'grid grid-cols-2 gap-2'}>
            {reduced ? null : (
              <Button variant="outline" size="lg" onClick={() => engine.current?.volley(6)}>
                <SparklesIcon /> More fireworks
              </Button>
            )}
            <DialogPrimitive.Close asChild>
              <Button size="lg" autoFocus>
                See results
              </Button>
            </DialogPrimitive.Close>
          </div>
        </div>
      </DialogPrimitive.Content>
    </>
  )
}

/** Score ring that fills from zero, with a tick at the pass mark. */
function ScoreRing({ pct, animate, onDone }: { pct: number; animate: boolean; onDone: () => void }) {
  const value = useCountUp(pct, animate, onDone)
  const size = 148
  const stroke = 12
  const pad = 30 // room for the pass-mark label
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const cx = pad + size / 2
  const cy = size / 2
  // The arc starts at 12 o'clock and runs clockwise.
  const angle = ((PASSING / 100) * 360 - 90) * (Math.PI / 180)
  const tick = (d: number) => [cx + Math.cos(angle) * (r + d), cy + Math.sin(angle) * (r + d)] as const
  const [x1, y1] = tick(-stroke / 2 - 3)
  const [x2, y2] = tick(stroke / 2 + 3)
  const [lx, ly] = tick(stroke / 2 + 8)

  return (
    <svg
      viewBox={`0 0 ${size + pad * 2} ${size}`}
      className="mx-auto block h-[148px] w-auto"
      role="img"
      aria-label={`Score ${pct}%, pass mark ${PASSING}%`}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap={value > 0.5 ? 'round' : 'butt'}
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        className="stroke-primary"
      />
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={2.5} strokeLinecap="round" className="stroke-foreground/60" />
      <text
        x={lx}
        y={ly}
        dominantBaseline="central"
        textAnchor="end"
        className="fill-muted-foreground text-[11px] font-semibold tabular-nums"
      >
        {PASSING}%
      </text>
      <text
        x={cx}
        y={cy}
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-[34px] font-extrabold tabular-nums"
      >
        {Math.round(value)}%
      </text>
    </svg>
  )
}

/** Eases a number from 0 up to `target`, then calls `onDone` once. */
function useCountUp(target: number, animate: boolean, onDone: () => void, duration = 1400) {
  const [value, setValue] = useState(animate ? 0 : target)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!animate) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setValue(target * (1 - (1 - t) ** 3))
      if (t < 1) raf = requestAnimationFrame(tick)
      else done.current()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, animate, duration])

  return value
}
