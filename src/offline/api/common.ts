import type { QuestionView } from '#/lib/question-view'

import { type LocalQuestion, type LocalSession, openLocalDb } from '../db'
import { loadLocalState, localStore } from '../store'
import { requestPush } from '../sync/engine'

/** Local reads need the in-memory view; load it on first use. */
export async function ensureLocal() {
  if (!localStore.state.ready) await loadLocalState()
  return localStore.state
}

/** Full questions by id (with answers), carrying this device's bookmark state. */
export async function loadViews(ids: readonly number[]) {
  const db = await openLocalDb()
  const tx = db.transaction('questions')
  const rows = await Promise.all(ids.map((id) => tx.store.get(id)))
  const progress = localStore.state.progress
  const out = new Map<number, LocalQuestion>()
  for (const q of rows) if (q) out.set(q.id, { ...q, bookmarked: progress.get(q.id)?.bookmarked ?? false })
  return out
}

/** A mock exam paper must not carry the answers. */
export function withoutAnswers(q: LocalQuestion): QuestionView {
  const { answerKey: _key, rationale: _rationale, mnemonic: _mnemonic, ...view } = q
  return view
}

export async function getLocalSession(id: string) {
  return (await openLocalDb()).get('sessions', id)
}

/** Store a session changed on this device and queue it for upload. */
export async function saveLocalSession(session: LocalSession) {
  await (await openLocalDb()).put('sessions', {
    ...session,
    updatedAt: new Date(),
    pending: 1,
    rev: (session.rev ?? 0) + 1,
  })
  requestPush()
}

export const byNewest = <T>(pick: (x: T) => Date | null) => (a: T, b: T) =>
  (pick(b)?.getTime() ?? 0) - (pick(a)?.getTime() ?? 0)
