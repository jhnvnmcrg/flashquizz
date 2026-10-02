import { createStore } from '@tanstack/store'

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
  progress: ReadonlyMap<number, LocalProgress>
  taxonomy: LocalTaxonomy | null
  needsReview: number
  questionTotal: number
  /** Bumped on every reload, so queries can key on it. */
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

/** (Re)load the in-memory view from IndexedDB. */
export async function loadLocalState() {
  const db = await openLocalDb()
  const [index, progress, taxonomy, content] = await Promise.all([
    db.getAll('qindex'),
    db.getAll('progress'),
    db.get('taxonomy', 'current'),
    getMeta('content'),
  ])
  localStore.setState((s) => ({
    ready: true,
    hasContent: !!content,
    index: new Map(index.map((q) => [q.id, q])),
    progress: new Map(progress.map((p) => [p.questionId, p])),
    taxonomy: taxonomy ?? null,
    needsReview: content?.needsReview ?? 0,
    questionTotal: content?.questionTotal ?? 0,
    version: s.version + 1,
  }))
}

export function resetLocalState() {
  localStore.setState(() => empty())
}
