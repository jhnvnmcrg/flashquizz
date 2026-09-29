import { describe, expect, it } from 'vitest'

import { applyAnswer, applyBookmark, BOX_INTERVAL_DAYS, emptyProgress, isDue, type ProgressState } from './leitner.ts'
import { mulberry32, shuffle } from './random.ts'
import { apportion, buildExam, buildSession, type Candidate } from './session-builder.ts'

const NOW = new Date('2026-10-01T08:00:00Z')
const DAY = 86_400_000

describe('leitner', () => {
  it('wrong answers enter box 1, due now', () => {
    const p = applyAnswer(null, false, NOW)
    expect(p.box).toBe(1)
    expect(p.dueAt).toEqual(NOW)
    expect(p.wrongCount).toBe(1)
    expect(p.streak).toBe(0)
    expect(isDue(p, NOW)).toBe(true)
  })

  it('correct answers outside the deck stay in box 0', () => {
    const p = applyAnswer(null, true, NOW)
    expect(p.box).toBe(0)
    expect(p.dueAt).toBeNull()
    expect(p.correctCount).toBe(1)
  })

  it('correct answers promote through the boxes with growing intervals', () => {
    let p = applyAnswer(null, false, NOW)
    for (let box = 2; box <= 5; box++) {
      p = applyAnswer(p, true, NOW)
      expect(p.box).toBe(box)
      expect(p.dueAt!.getTime() - NOW.getTime()).toBe(BOX_INTERVAL_DAYS[box] * DAY)
    }
    p = applyAnswer(p, true, NOW)
    expect(p.box).toBe(5)
    expect(p.streak).toBe(5)
  })

  it('a miss from a high box drops back to box 1', () => {
    let p: ProgressState = { ...emptyProgress(), box: 4, dueAt: NOW }
    p = applyAnswer(p, false, NOW)
    expect(p.box).toBe(1)
  })

  it('bookmarking adds a card to the deck; unbookmarking keeps its schedule', () => {
    const on = applyBookmark(null, true, NOW)
    expect(on).toMatchObject({ bookmarked: true, box: 1 })
    const later = applyAnswer(on, true, NOW)
    const off = applyBookmark(later, false, NOW)
    expect(off.bookmarked).toBe(false)
    expect(off.box).toBe(later.box)
  })
})

describe('random', () => {
  it('shuffles deterministically for a seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffle(items, mulberry32(42))).toEqual(shuffle(items, mulberry32(42)))
    expect(shuffle(items, mulberry32(42))).not.toEqual(items)
  })
})

function candidate(id: number, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    moduleSlug: 'm1',
    groupId: null,
    groupOrder: null,
    sortKey: [0, 0, id],
    progress: null,
    ...overrides,
  }
}

describe('session builder', () => {
  const grouped = [
    candidate(1),
    candidate(2, { groupId: 9, groupOrder: 2 }),
    candidate(3, { groupId: 9, groupOrder: 1 }),
    candidate(4, { groupId: 9, groupOrder: 3 }),
    candidate(5),
    candidate(6),
  ]

  it('never splits a group and keeps group order', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = buildSession({ candidates: grouped, count: 6, order: 'random', seed, now: NOW })
      const i = ids.indexOf(3)
      expect(ids.slice(i, i + 3)).toEqual([3, 2, 4])
    }
  })

  it('may overshoot the count by at most one group', () => {
    const ids = buildSession({ candidates: grouped, count: 2, order: 'sequential', seed: 1, now: NOW })
    expect(ids).toEqual([1, 3, 2, 4])
  })

  it('smart order puts due cards first, then unseen, then misses', () => {
    const seen = { seenCount: 1, box: 0, dueAt: null, lastAnsweredAt: NOW }
    const candidates = [
      candidate(1, { progress: { ...seen, lastCorrect: true } }),
      candidate(2, { progress: { ...seen, lastCorrect: false, box: 1, dueAt: new Date(NOW.getTime() + DAY) } }),
      candidate(3),
      candidate(4, { progress: { ...seen, lastCorrect: false, box: 1, dueAt: NOW } }),
    ]
    const ids = buildSession({ candidates, count: 4, order: 'smart', seed: 3, now: NOW })
    expect(ids).toEqual([4, 3, 2, 1])
  })

  it('is deterministic for a seed', () => {
    const many = Array.from({ length: 40 }, (_, i) => candidate(i + 1))
    const a = buildSession({ candidates: many, count: 10, order: 'smart', seed: 7, now: NOW })
    const b = buildSession({ candidates: many, count: 10, order: 'smart', seed: 7, now: NOW })
    expect(a).toEqual(b)
    expect(a).toHaveLength(10)
  })
})

describe('exam builder', () => {
  it('apportions items to modules by pool size', () => {
    expect(apportion({ m1: 50, m2: 30, m3: 20 }, 10)).toEqual({ m1: 5, m2: 3, m3: 2 })
    const q = apportion({ m1: 1, m2: 1, m3: 1 }, 2)
    expect(Object.values(q).reduce((s, n) => s + n, 0)).toBe(2)
    expect(apportion({ m1: 3 }, 10)).toEqual({ m1: 3 })
  })

  it('draws per-module quotas without duplicates', () => {
    const pool = [
      ...Array.from({ length: 60 }, (_, i) => candidate(i + 1, { moduleSlug: 'm1' })),
      ...Array.from({ length: 40 }, (_, i) => candidate(i + 101, { moduleSlug: 'm4' })),
    ]
    const ids = buildExam({ candidates: pool, count: 20, seed: 11 })
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
    expect(ids.filter((id) => id > 100)).toHaveLength(8)
  })
})
