import { applyAnswer, applyBookmark, type ProgressState } from '../leitner.ts'

/**
 * Everything that changes a question's Leitner progress. Progress is never
 * merged field by field: it is rebuilt from the full history, so the phone,
 * the laptop and the server always agree once they hold the same events.
 */
export type ProgressEvent =
  | { kind: 'answer'; id: string; at: Date; correct: boolean }
  | { kind: 'bookmark'; id: string; at: Date; bookmarked: boolean }

/** An attempt's event id: the device's id when it has one, otherwise the server row id. */
export function attemptEventId(a: { id: number | string; clientId: string | null }) {
  return a.clientId ?? `a:${String(a.id).padStart(12, '0')}`
}

/** One total order everywhere: time, then id (ties are rare but must not differ). */
export function compareEvents(a: ProgressEvent, b: ProgressEvent) {
  return a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Apply events on top of a known state, in event order. */
export function applyEvents(base: ProgressState | null, events: readonly ProgressEvent[]) {
  let p = base
  for (const e of [...events].sort(compareEvents)) {
    p = e.kind === 'answer' ? applyAnswer(p, e.correct, e.at) : applyBookmark(p, e.bookmarked, e.at)
  }
  return p
}

/** A question's progress from its complete history; null when it has none. */
export function foldProgress(events: readonly ProgressEvent[]) {
  return applyEvents(null, events)
}

/** Group events by question and rebuild each question's progress. */
export function foldAll(events: Iterable<ProgressEvent & { questionId: number }>) {
  const byQuestion = new Map<number, ProgressEvent[]>()
  for (const e of events) {
    const list = byQuestion.get(e.questionId) ?? []
    list.push(e)
    byQuestion.set(e.questionId, list)
  }
  const out = new Map<number, ProgressState>()
  for (const [questionId, list] of byQuestion) {
    const p = foldProgress(list)
    if (p) out.set(questionId, p)
  }
  return out
}
