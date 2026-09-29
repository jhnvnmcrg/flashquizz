/**
 * Leitner spaced repetition for the review deck (mistakes + bookmarks).
 *
 * Box 0 = not in the deck. A wrong answer (or a bookmark) puts a card in box 1,
 * due immediately. Each correct answer from box n ≥ 1 promotes it one box and
 * schedules it further out. Box 5 is the ceiling.
 */

export const MAX_BOX = 5
/** Days until due after landing in box n (index = box). */
export const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 21] as const

const DAY_MS = 86_400_000

export type ProgressState = {
  box: number
  dueAt: Date | null
  seenCount: number
  correctCount: number
  wrongCount: number
  streak: number
  lastCorrect: boolean | null
  lastAnsweredAt: Date | null
  bookmarked: boolean
  bookmarkedAt: Date | null
}

export function emptyProgress(): ProgressState {
  return {
    box: 0,
    dueAt: null,
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    lastCorrect: null,
    lastAnsweredAt: null,
    bookmarked: false,
    bookmarkedAt: null,
  }
}

export function applyAnswer(prev: ProgressState | null, correct: boolean, now: Date): ProgressState {
  const p = prev ?? emptyProgress()
  const base = {
    ...p,
    seenCount: p.seenCount + 1,
    correctCount: p.correctCount + (correct ? 1 : 0),
    wrongCount: p.wrongCount + (correct ? 0 : 1),
    streak: correct ? p.streak + 1 : 0,
    lastCorrect: correct,
    lastAnsweredAt: now,
  }
  if (!correct) return { ...base, box: 1, dueAt: now }
  if (p.box === 0) return { ...base, box: 0, dueAt: null }
  const box = Math.min(p.box + 1, MAX_BOX)
  return { ...base, box, dueAt: new Date(now.getTime() + BOX_INTERVAL_DAYS[box] * DAY_MS) }
}

export function applyBookmark(prev: ProgressState | null, bookmarked: boolean, now: Date): ProgressState {
  const p = prev ?? emptyProgress()
  if (!bookmarked) return { ...p, bookmarked: false, bookmarkedAt: null }
  const enters = p.box === 0
  return {
    ...p,
    bookmarked: true,
    bookmarkedAt: p.bookmarkedAt ?? now,
    box: enters ? 1 : p.box,
    dueAt: enters ? now : p.dueAt,
  }
}

export function isDue(p: Pick<ProgressState, 'box' | 'dueAt'> | null, now: Date) {
  return !!p && p.box > 0 && !!p.dueAt && p.dueAt.getTime() <= now.getTime()
}
