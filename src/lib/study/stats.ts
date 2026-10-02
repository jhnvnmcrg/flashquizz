import { STUDY_TIMEZONE } from '../constants.ts'
import { isDue, type ProgressState } from '../leitner.ts'
import { addTally, emptyTally, type Tally } from '../tally.ts'
import type { IndexedQuestion, ProgressMap } from './candidates.ts'

const DAY_MS = 86_400_000
/** How far back the streak looks (matches the server query). */
const STREAK_WINDOW_DAYS = 120

const dayParts = new Intl.DateTimeFormat('en-US', {
  timeZone: STUDY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' of a moment in study time (Manila). */
export function dayKey(at: Date) {
  const parts = Object.fromEntries(dayParts.formatToParts(at).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function previousDay(key: string) {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function tallyOf(p: ProgressState | null, now: Date): Tally {
  return {
    total: 1,
    seen: p && p.seenCount > 0 ? 1 : 0,
    answered: p?.seenCount ?? 0,
    correct: p?.correctCount ?? 0,
    due: isDue(p, now) ? 1 : 0,
    bookmarked: p?.bookmarked ? 1 : 0,
    missed: p?.lastCorrect === false ? 1 : 0,
  }
}

/** Eligible-question tallies by module and topic. Mirrors `src/server/stats.server.ts`. */
export function topicTallies(
  index: Iterable<Pick<IndexedQuestion, 'id' | 'moduleId' | 'topicId' | 'eligible'>>,
  progress: ProgressMap,
  now: Date,
) {
  const byModule = new Map<number, Tally>()
  const byTopic = new Map<number, Tally>()
  const overall = emptyTally()
  const bucket = (map: Map<number, Tally>, key: number) => {
    let t = map.get(key)
    if (!t) {
      t = emptyTally()
      map.set(key, t)
    }
    return t
  }
  for (const q of index) {
    if (!q.eligible) continue
    const t = tallyOf(progress.get(q.id) ?? null, now)
    addTally(bucket(byModule, q.moduleId), t)
    if (q.topicId !== null) addTally(bucket(byTopic, q.topicId), t)
    addTally(overall, t)
  }
  return { byModule, byTopic, overall }
}

/** Consecutive study days ending today (or yesterday), in Manila time. */
export function studyStreak(answeredAt: Iterable<Date>, now: Date) {
  const since = now.getTime() - STREAK_WINDOW_DAYS * DAY_MS
  const days = new Set<string>()
  for (const at of answeredAt) if (at.getTime() > since) days.add(dayKey(at))
  const today = dayKey(now)
  let cursor = days.has(today) ? today : previousDay(today)
  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor = previousDay(cursor)
  }
  return { streak, studiedToday: days.has(today) }
}

/** Answers given today (Manila), including blank exam items. */
export function todayTotals(attempts: Iterable<{ answeredAt: Date; isCorrect: boolean }>, now: Date) {
  const today = dayKey(now)
  let answered = 0
  let correct = 0
  for (const a of attempts) {
    if (dayKey(a.answeredAt) !== today) continue
    answered++
    if (a.isCorrect) correct++
  }
  return { answered, correct }
}

/** Review cards coming due in the next `days` days, per Manila day. */
export function upcomingDue(progress: Iterable<ProgressState>, now: Date, days = 14) {
  const end = now.getTime() + days * DAY_MS
  const counts = new Map<string, number>()
  for (const p of progress) {
    if (p.box <= 0 || !p.dueAt) continue
    const t = p.dueAt.getTime()
    if (t <= now.getTime() || t >= end) continue
    const day = dayKey(p.dueAt)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([day, n]) => ({ day, n }))
}

/** How many cards sit in each Leitner box (box 0 = not in the deck, left out). */
export function boxCounts(progress: Iterable<ProgressState>) {
  const counts = new Map<number, number>()
  for (const p of progress) if (p.box > 0) counts.set(p.box, (counts.get(p.box) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => a - b).map(([box, n]) => ({ box, n }))
}
