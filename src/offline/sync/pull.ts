import type { ChoiceKey } from '#/lib/schemas/enums'
import type { Keyset, PushChanges } from '#/lib/schemas/sync'
import { mergeSession } from '#/lib/study/session-merge'
import type {
  applyPush,
  attemptsSince,
  progressSince,
  SyncManifest,
  SyncQuestion,
  sessionsSince,
} from '#/server/sync.server'

import {
  getMeta,
  type LocalAttempt,
  type LocalDb,
  type LocalSession,
  type ManifestImage,
  type Meta,
  openLocalDb,
  setMeta,
} from '../db'

/** How the device talks to the server; tests pass a fake. */
export type SyncTransport = {
  manifest(contentHash: string | null): Promise<SyncManifest>
  questions(ids: number[]): Promise<SyncQuestion[]>
  progressSince(since: Date | null, after: Keyset | null): ReturnType<typeof progressSince>
  sessionsSince(since: Date | null, after: Keyset | null): ReturnType<typeof sessionsSince>
  attemptsSince(since: Date | null, after: Keyset | null): ReturnType<typeof attemptsSince>
  push(changes: Omit<PushChanges, 'protocol' | 'userId'>): ReturnType<typeof applyPush>
}

export type PullStep = 'questions' | 'progress' | 'sessions' | 'answers'
export type PullProgress = { step: PullStep; done: number; total: number }

const QUESTION_PAGE = 250
/** Pull windows overlap a little: app and database clocks differ, and commits land late. */
const OVERLAP_MS = 5 * 60_000

const noWatermarks: Meta['watermarks'] = { progress: null, sessions: null, attempts: null }

/**
 * Bring the device up to date: content first (resumable, by hash), then
 * progress, sessions and answers since the last pull. Safe to re-run.
 */
export async function pull(transport: SyncTransport, onProgress: (p: PullProgress) => void = () => {}) {
  const db = await openLocalDb()
  const content = await getMeta('content')
  const manifest = await transport.manifest(content?.hash ?? null)
  const contentChanged = manifest.unchanged ? false : await applyContent(db, transport, manifest, onProgress)
  const progressChanged = await pullProgress(db, transport, onProgress)
  const sessionsChanged = await pullSessions(db, transport, onProgress)
  const attemptsChanged = await pullAttempts(db, transport, onProgress)
  // Next time, start a little before this pull began (read before any data).
  const next = new Date(manifest.serverTime.getTime() - OVERLAP_MS)
  const marks = (await getMeta('watermarks')) ?? noWatermarks
  await setMeta('watermarks', { ...marks, progress: next, sessions: next, attempts: next })
  const images = manifest.unchanged ? ((await getMeta('images')) ?? []) : manifest.images
  return { changed: contentChanged || progressChanged || sessionsChanged || attemptsChanged, images }
}

async function applyContent(
  db: LocalDb,
  transport: SyncTransport,
  manifest: Extract<SyncManifest, { unchanged: false }>,
  onProgress: (p: PullProgress) => void,
) {
  const held = new Map((await db.getAll('qindex')).map((q) => [q.id, q.h]))
  const wanted = new Set(manifest.questions.map((q) => q.id))
  const fetchIds = manifest.questions.filter((q) => held.get(q.id) !== q.h).map((q) => q.id)

  onProgress({ step: 'questions', done: 0, total: fetchIds.length })
  for (let i = 0; i < fetchIds.length; i += QUESTION_PAGE) {
    const page = await transport.questions(fetchIds.slice(i, i + QUESTION_PAGE))
    const tx = db.transaction(['qindex', 'questions'], 'readwrite')
    for (const q of page) {
      void tx.objectStore('qindex').put({ ...q.index, h: q.h })
      void tx.objectStore('questions').put(q.view)
    }
    await tx.done
    onProgress({ step: 'questions', done: Math.min(i + QUESTION_PAGE, fetchIds.length), total: fetchIds.length })
  }

  // Drop what the server no longer lists, unless an unsent local session still shows it.
  const keep = new Set(
    (await db.getAllFromIndex('sessions', 'pending', 1)).flatMap((s) => s.items.map((i) => i.questionId)),
  )
  const gone = [...held.keys()].filter((id) => !wanted.has(id) && !keep.has(id))
  if (gone.length) {
    const tx = db.transaction(['qindex', 'questions'], 'readwrite')
    for (const id of gone) {
      void tx.objectStore('qindex').delete(id)
      void tx.objectStore('questions').delete(id)
    }
    await tx.done
  }

  await db.put('taxonomy', manifest.taxonomy, 'current')
  await setMeta('images', manifest.images satisfies ManifestImage[])
  // Written last: an interrupted download resumes where it stopped.
  await setMeta('content', {
    hash: manifest.hash,
    syncedAt: manifest.serverTime,
    needsReview: manifest.needsReview,
    questionTotal: manifest.questions.length,
  })
  return true
}

async function pages<T>(
  fetchPage: (after: Keyset | null) => Promise<{ rows: T[]; next: Keyset | null }>,
  apply: (rows: T[]) => Promise<void>,
) {
  let after: Keyset | null = null
  let count = 0
  do {
    const page = await fetchPage(after)
    if (page.rows.length) await apply(page.rows)
    count += page.rows.length
    after = page.next
  } while (after)
  return count
}

async function pullProgress(db: LocalDb, transport: SyncTransport, onProgress: (p: PullProgress) => void) {
  const since = (await getMeta('watermarks'))?.progress ?? null
  const n = await pages(
    (after) => transport.progressSince(since, after),
    async (rows) => {
      const tx = db.transaction('progress', 'readwrite')
      for (const r of rows) void tx.store.put(r)
      await tx.done
    },
  )
  onProgress({ step: 'progress', done: n, total: n })
  return n > 0
}

async function pullSessions(db: LocalDb, transport: SyncTransport, onProgress: (p: PullProgress) => void) {
  const since = (await getMeta('watermarks'))?.sessions ?? null
  const n = await pages(
    (after) => transport.sessionsSince(since, after),
    async (rows) => {
      const tx = db.transaction('sessions', 'readwrite')
      for (const r of rows) {
        const server: LocalSession = {
          id: r.id,
          mode: r.mode,
          status: r.status,
          filters: r.filters,
          orderMode: r.orderMode,
          questionCount: r.questionCount,
          startedAt: r.startedAt,
          durationSec: r.durationSec,
          expiresAt: r.expiresAt,
          completedAt: r.completedAt,
          autoSubmitted: r.autoSubmitted,
          answeredCount: r.answeredCount,
          correctCount: r.correctCount,
          updatedAt: r.updatedAt,
          items: r.items.map((i) => ({
            position: i.position,
            questionId: i.questionId,
            selectedKey: i.selectedKey as ChoiceKey | null,
            isCorrect: i.isCorrect,
            answeredAt: i.answeredAt,
            responseMs: i.responseMs,
            flagged: i.flagged,
          })),
          pending: 0,
        }
        const local = await tx.store.get(r.id)
        // Local changes not yet uploaded win their items; the rest comes from the server.
        void tx.store.put(local?.pending ? { ...mergeSession(server, local), pending: 1 } : server)
      }
      await tx.done
    },
  )
  onProgress({ step: 'sessions', done: n, total: n })
  return n > 0
}

async function pullAttempts(db: LocalDb, transport: SyncTransport, onProgress: (p: PullProgress) => void) {
  const since = (await getMeta('watermarks'))?.attempts ?? null
  const n = await pages(
    (after) => transport.attemptsSince(since, after),
    async (rows) => {
      const tx = db.transaction('attempts', 'readwrite')
      for (const r of rows) {
        // Our own uploads come back under their client id: that marks them as synced.
        const id = r.clientId ?? `s:${r.id}`
        const local = await tx.store.get(id)
        const row: LocalAttempt = local
          ? { ...local, isCorrect: r.isCorrect, pending: 0 }
          : {
              id,
              clientId: r.clientId,
              questionId: r.questionId,
              sessionId: r.sessionId,
              mode: r.mode,
              selectedKey: null,
              selfGrade: null,
              isCorrect: r.isCorrect,
              responseMs: null,
              answeredAt: r.answeredAt,
              pending: 0,
            }
        void tx.store.put(row)
      }
      await tx.done
    },
  )
  onProgress({ step: 'answers', done: n, total: n })
  return n > 0
}
