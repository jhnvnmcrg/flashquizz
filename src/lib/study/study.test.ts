import { describe, expect, it } from 'vitest'

import { applyAnswer, applyBookmark, emptyProgress, type ProgressState } from '../leitner.ts'
import type { StudyFilters } from '../schemas/study.ts'
import { type IndexedQuestion, retryIdsFrom, selectCandidates } from './candidates.ts'
import { gradeExamItems, isAnswerCorrect } from './grading.ts'
import { applyEvents, foldAll, foldProgress, type ProgressEvent } from './progress-fold.ts'
import { type MergeItem, type MergeSession, mergeSession } from './session-merge.ts'
import { boxCounts, dayKey, studyStreak, todayTotals, topicTallies, upcomingDue } from './stats.ts'

const NOW = new Date('2026-10-01T08:00:00Z') // 16:00 in Manila
const DAY = 86_400_000
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

function q(id: number, overrides: Partial<IndexedQuestion> = {}): IndexedQuestion {
  return {
    id,
    moduleId: 1,
    moduleSlug: 'm1',
    topicId: 10,
    sourceSlug: 'pb1',
    groupId: null,
    groupOrder: null,
    sortKey: [0, 0, id],
    eligible: true,
    ...overrides,
  }
}

const filters = (f: Partial<StudyFilters> = {}): StudyFilters => ({
  moduleSlugs: [],
  topicIds: [],
  sourceSlugs: [],
  scope: 'all',
  fromSessionId: null,
  ...f,
})

const progress = (p: Partial<ProgressState>): ProgressState => ({ ...emptyProgress(), ...p })

describe('selectCandidates', () => {
  const index = [
    q(1),
    q(2, { moduleId: 4, moduleSlug: 'm4', topicId: 40, sourceSlug: 'm4pt' }),
    q(3, { eligible: false }),
    q(4, { topicId: null }),
    q(5),
  ]
  const prog = new Map<number, ProgressState>([
    [1, progress({ seenCount: 2, lastCorrect: false, box: 1, dueAt: NOW })],
    [2, progress({ seenCount: 1, lastCorrect: true, bookmarked: true, box: 2, dueAt: at(DAY) })],
    [5, progress({ seenCount: 0, bookmarked: false })],
  ])
  const ids = (f: Partial<StudyFilters>, retryIds?: Set<number>) =>
    selectCandidates({ index, progress: prog, filters: filters(f), now: NOW, retryIds })
      .map((c) => c.id)
      .sort()

  it('skips ineligible questions and applies module/topic/source filters', () => {
    expect(ids({})).toEqual([1, 2, 4, 5])
    expect(ids({ moduleSlugs: ['m4'] })).toEqual([2])
    expect(ids({ topicIds: [10] })).toEqual([1, 5])
    expect(ids({ sourceSlugs: ['m4pt', 'pb1'] })).toEqual([1, 2, 4, 5])
  })

  it('applies each scope like the SQL version', () => {
    expect(ids({ scope: 'unseen' })).toEqual([4, 5])
    expect(ids({ scope: 'mistakes' })).toEqual([1])
    expect(ids({ scope: 'bookmarked' })).toEqual([2])
    expect(ids({ scope: 'due' })).toEqual([1])
  })

  it('retries a session’s misses and ignores the scope', () => {
    const retry = retryIdsFrom([
      { questionId: 1, isCorrect: false },
      { questionId: 2, isCorrect: true },
      { questionId: 5, isCorrect: null },
    ])
    expect([...retry].sort()).toEqual([1, 5])
    expect(ids({ fromSessionId: '00000000-0000-4000-8000-000000000000', scope: 'due' }, retry)).toEqual([1, 5])
  })

  it('passes progress through in the session builder’s shape', () => {
    const [c] = selectCandidates({ index: [q(2)], progress: prog, filters: filters(), now: NOW })
    expect(c.progress).toEqual({ box: 2, dueAt: at(DAY), seenCount: 1, lastCorrect: true, lastAnsweredAt: null })
    const [none] = selectCandidates({ index: [q(9)], progress: prog, filters: filters(), now: NOW })
    expect(none.progress).toBeNull()
  })
})

describe('stats', () => {
  it('uses Manila days (UTC+8, no DST)', () => {
    expect(dayKey(new Date('2026-09-30T15:59:59Z'))).toBe('2026-09-30')
    expect(dayKey(new Date('2026-09-30T16:00:00Z'))).toBe('2026-10-01')
  })

  it('tallies eligible questions by module and topic', () => {
    const index = [q(1), q(2, { moduleId: 4, topicId: 40 }), q(3, { eligible: false }), q(4, { topicId: null })]
    const prog = new Map([
      [1, progress({ seenCount: 3, correctCount: 2, lastCorrect: false, box: 1, dueAt: NOW })],
      [2, progress({ seenCount: 1, correctCount: 1, lastCorrect: true, bookmarked: true })],
      [3, progress({ seenCount: 9 })],
    ])
    const t = topicTallies(index, prog, NOW)
    expect(t.overall).toEqual({ total: 3, seen: 2, answered: 4, correct: 3, due: 1, bookmarked: 1, missed: 1 })
    expect(t.byModule.get(1)?.total).toBe(2)
    expect(t.byTopic.get(10)?.total).toBe(1)
    expect(t.byTopic.has(40)).toBe(true)
  })

  it('counts a streak back from today, or from yesterday if nothing yet today', () => {
    const d = (days: number) => at(-days * DAY)
    expect(studyStreak([d(0), d(1), d(2), d(4)], NOW)).toEqual({ streak: 3, studiedToday: true })
    expect(studyStreak([d(1), d(2)], NOW)).toEqual({ streak: 2, studiedToday: false })
    expect(studyStreak([d(3)], NOW)).toEqual({ streak: 0, studiedToday: false })
    expect(studyStreak([d(121)], NOW)).toEqual({ streak: 0, studiedToday: false })
  })

  it('totals today’s answers by Manila day', () => {
    const attempts = [
      { answeredAt: new Date('2026-09-30T16:00:00Z'), isCorrect: true }, // 00:00 Oct 1 Manila
      { answeredAt: new Date('2026-09-30T15:59:59Z'), isCorrect: true }, // Sep 30
      { answeredAt: NOW, isCorrect: false },
    ]
    expect(todayTotals(attempts, NOW)).toEqual({ answered: 2, correct: 1 })
  })

  it('lists upcoming reviews per day and box sizes', () => {
    const rows = [
      progress({ box: 1, dueAt: NOW }), // due now, not upcoming
      progress({ box: 2, dueAt: at(DAY) }),
      progress({ box: 3, dueAt: at(DAY + 60_000) }),
      progress({ box: 5, dueAt: at(20 * DAY) }), // beyond 14 days
      progress({ box: 0 }),
    ]
    expect(upcomingDue(rows, NOW)).toEqual([{ day: '2026-10-02', n: 2 }])
    expect(boxCounts(rows)).toEqual([
      { box: 1, n: 1 },
      { box: 2, n: 1 },
      { box: 3, n: 1 },
      { box: 5, n: 1 },
    ])
  })
})

describe('progress fold', () => {
  const answer = (id: string, offset: number, correct: boolean): ProgressEvent => ({
    kind: 'answer',
    id,
    at: at(offset),
    correct,
  })
  const mark = (id: string, offset: number, bookmarked: boolean): ProgressEvent => ({
    kind: 'bookmark',
    id,
    at: at(offset),
    bookmarked,
  })

  it('matches applying the same events live, in time order', () => {
    const live = applyAnswer(applyBookmark(applyAnswer(null, true, at(0)), true, at(1000)), true, at(2000))
    const events = [answer('c', 2000, true), mark('b', 1000, true), answer('a', 0, true)]
    expect(foldProgress(events)).toEqual(live)
  })

  it('keeps the bookmark box bump in history', () => {
    const p = foldProgress([mark('a', 0, true), answer('b', 1000, true)])
    expect(p?.box).toBe(2)
    const unmarked = foldProgress([mark('a', 0, true), mark('b', 500, false), answer('c', 1000, true)])
    expect(unmarked).toMatchObject({ box: 2, bookmarked: false })
  })

  it('breaks time ties by id so every device agrees', () => {
    const a = foldProgress([answer('x', 0, false), answer('y', 0, true)])
    const b = foldProgress([answer('y', 0, true), answer('x', 0, false)])
    expect(a).toEqual(b)
    expect(a?.lastCorrect).toBe(true)
  })

  it('returns null without history and folds per question', () => {
    expect(foldProgress([])).toBeNull()
    const all = foldAll([
      { ...answer('a', 0, false), questionId: 1 },
      { ...answer('b', 0, true), questionId: 2 },
    ])
    expect(all.get(1)?.box).toBe(1)
    expect(all.get(2)?.box).toBe(0)
    expect(applyEvents(all.get(1) ?? null, [answer('c', 10, true)])?.box).toBe(2)
  })
})

describe('session merge', () => {
  const item = (position: number, overrides: Partial<MergeItem> = {}): MergeItem => ({
    position,
    questionId: 100 + position,
    selectedKey: null,
    isCorrect: null,
    answeredAt: null,
    responseMs: null,
    flagged: false,
    ...overrides,
  })
  const session = (status: MergeSession['status'], items: MergeItem[], completedAt: Date | null = null) => ({
    id: 's1',
    status,
    completedAt,
    items,
  })

  it('unions answers from two devices; the earliest answer wins', () => {
    const phone = session('active', [
      item(0, { selectedKey: 'A', isCorrect: true, answeredAt: at(1000) }),
      item(1),
      item(2, { selectedKey: 'B', isCorrect: false, answeredAt: at(5000) }),
    ])
    const laptop = session('active', [
      item(0, { selectedKey: 'C', isCorrect: false, answeredAt: at(9000) }),
      item(1, { selectedKey: 'D', isCorrect: true, answeredAt: at(2000) }),
      item(2, { selectedKey: 'A', isCorrect: true, answeredAt: at(3000) }),
    ])
    const merged = mergeSession(phone, laptop)
    expect(merged.items.map((i) => i.selectedKey)).toEqual(['A', 'D', 'A'])
    expect(merged).toMatchObject({ answeredCount: 3, correctCount: 3, status: 'active', completedAt: null })
  })

  it('never un-answers an item, and ignores items for a different question', () => {
    const base = session('active', [item(0, { selectedKey: 'A', isCorrect: true, answeredAt: at(1000) })])
    const blank = session('active', [item(0), item(1, { questionId: 999, selectedKey: 'B', answeredAt: at(1) })])
    const merged = mergeSession(base, blank)
    expect(merged.items[0].selectedKey).toBe('A')
    expect(merged.items[1].questionId).toBe(999)
    const clash = mergeSession(base, session('active', [item(0, { questionId: 5, answeredAt: at(0) })]))
    expect(clash.items[0].questionId).toBe(100)
  })

  it('only moves status forward; abandoned with answers becomes completed', () => {
    const done = session('completed', [item(0, { answeredAt: at(0), isCorrect: true })], at(100))
    expect(mergeSession(done, session('active', [item(0)])).status).toBe('completed')
    const abandoned = mergeSession(
      session('active', [item(0, { answeredAt: at(50), isCorrect: false })]),
      session('abandoned', [item(0)]),
    )
    expect(abandoned.status).toBe('completed')
    expect(abandoned.completedAt).toEqual(at(50))
  })
})

describe('grading', () => {
  it('checks keys server-side and trusts only flashcard self-grades', () => {
    expect(isAnswerCorrect({ mode: 'practice', selectedKey: 'B', answerKey: 'B' })).toBe(true)
    expect(isAnswerCorrect({ mode: 'review', selectedKey: null, answerKey: 'B' })).toBe(false)
    expect(isAnswerCorrect({ mode: 'flashcards', selectedKey: null, answerKey: 'B', selfGrade: 'got_it' })).toBe(true)
  })

  it('grades an exam with blanks as wrong', () => {
    const keys = new Map([
      [1, 'A'],
      [2, 'B'],
      [3, 'C'],
    ])
    const r = gradeExamItems(
      [
        { questionId: 1, selectedKey: 'A' },
        { questionId: 2, selectedKey: 'C' },
        { questionId: 3, selectedKey: null },
      ],
      keys,
    )
    expect(r.graded.map((g) => g.isCorrect)).toEqual([true, false, false])
    expect(r).toMatchObject({ answeredCount: 2, correctCount: 1 })
  })
})
