import { createStore } from '@tanstack/store'

import { applyEvents, type ProgressEvent } from '#/lib/study/progress-fold'

import { getMeta, type LocalIndex, type LocalProgress, type LocalTaxonomy, openLocalDb } from './db'

/**
 * What study screens read synchronously: the question index and progress
 * for every question on the device, plus the taxonomy. Full questions stay in
 * IndexedDB and are read by id when a session needs them.
 */
export type LocalState = {
  ready: boolean
  /** True once the question bank has been downloaded at least once. */
  hasContent: boolean
  index: ReadonlyMap<number, LocalIndex>
  /** The server's progress with this device's unsynced answers and bookmarks applied on top. */
  progress: ReadonlyMap<number, LocalProgress>
  taxonomy: LocalTaxonomy | null
  needsReview: number
  questionTotal: number
  /** Bumped on every change, so queries can key on it. */
  version: number
}

const empty = (): LocalState => ({
  ready: false,
  hasContent: false,
  index: new Map(),
  progress: new Map(),
  taxonomy: null,
  needsReview: 0,
  questionTotal: 0,
  version: 0,
})

export const localStore = createStore<LocalState>(empty())

const withId = (questionId: number, base: LocalProgress | null, next: ReturnType<typeof applyEvents>) =>
  next ? { ...next, questionId, updatedAt: base?.updatedAt ?? new Date(0) } : null

/** (Re)load the in-memory view from IndexedDB. */
export async function loadLocalState() {
  const db = await openLocalDb()
  const [index, base, taxonomy, content, answers, marks] = await Promise.all([
    db.getAll('qindex'),
    db.getAll('progress'),
    db.get('taxonomy', 'current'),
    getMeta('content'),
    db.getAllFromIndex('attempts', 'pending', 1),
    db.getAllFromIndex('bookmarkEvents', 'pending', 1),
  ])
  const progress = new Map(base.map((p) => [p.questionId, p]))
  const unsynced = new Map<number, ProgressEvent[]>()
  const add = (questionId: number, e: ProgressEvent) => unsynced.set(questionId, [...(unsynced.get(questionId) ?? []), e])
  for (const a of answers) add(a.questionId, { kind: 'answer', id: a.id, at: a.answeredAt, correct: a.isCorrect })
  for (const b of marks) add(b.questionId, { kind: 'bookmark', id: b.clientId, at: b.at, bookmarked: b.bookmarked })
  for (const [questionId, events] of unsynced) {
    const before = progress.get(questionId) ?? null
    const after = withId(questionId, before, applyEvents(before, events))
    if (after) progress.set(questionId, after)
  }
  localStore.setState((s) => ({
    ready: true,
    hasContent: !!content,
    index: new Map(index.map((q) => [q.id, q])),
    progress,
    taxonomy: taxonomy ?? null,
    needsReview: content?.needsReview ?? 0,
    questionTotal: content?.questionTotal ?? 0,
    version: s.version + 1,
  }))
}

/** Reflect a just-saved local answer or bookmark in memory (the record is already in IndexedDB). */
export function applyLocalEvent(questionId: number, event: ProgressEvent) {
  localStore.setState((s) => {
    const before = s.progress.get(questionId) ?? null
    const after = withId(questionId, before, applyEvents(before, [event]))
    if (!after) return s
    const progress = new Map(s.progress)
    progress.set(questionId, after)
    return { ...s, progress, version: s.version + 1 }
  })
}

export function resetLocalState() {
  localStore.setState(() => empty())
}
