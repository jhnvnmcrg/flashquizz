import type { AttemptUpload, BookmarkUpload, SessionUpload, SyncRejection } from '#/lib/schemas/sync'

import { type LocalAttempt, type LocalBookmarkEvent, type LocalDb, type LocalSession, openLocalDb } from '../db'
import type { SyncTransport } from './pull'

const SESSIONS_PER_CALL = 20
const RECORDS_PER_CALL = 400

/** A mock exam stays on this device until it's graded. */
const uploadable = (s: LocalSession) => !(s.mode === 'exam' && s.status === 'active')

const toSession = (s: LocalSession): SessionUpload => ({
  id: s.id,
  mode: s.mode,
  status: s.status,
  filters: s.filters,
  orderMode: s.orderMode,
  startedAt: s.startedAt,
  durationSec: s.durationSec,
  expiresAt: s.expiresAt,
  completedAt: s.completedAt,
  autoSubmitted: s.autoSubmitted,
  items: s.items.map((i) => ({
    position: i.position,
    questionId: i.questionId,
    selectedKey: i.selectedKey,
    isCorrect: i.isCorrect,
    answeredAt: i.answeredAt,
    responseMs: i.responseMs,
    flagged: i.flagged,
  })),
})

const toAttempt = (a: LocalAttempt): AttemptUpload => ({
  clientId: a.clientId ?? a.id,
  questionId: a.questionId,
  sessionId: a.sessionId,
  mode: a.mode,
  selectedKey: a.selectedKey,
  selfGrade: a.selfGrade,
  responseMs: a.responseMs,
  answeredAt: a.answeredAt,
})

const toBookmark = (b: LocalBookmarkEvent): BookmarkUpload => ({
  clientId: b.clientId,
  questionId: b.questionId,
  bookmarked: b.bookmarked,
  at: b.at,
})

/** Is there anything to upload? (Cheap: three index counts.) */
export async function hasPending() {
  const db = await openLocalDb()
  const [a, b, s] = await Promise.all([
    db.countFromIndex('attempts', 'pending', 1),
    db.countFromIndex('bookmarkEvents', 'pending', 1),
    db.getAllFromIndex('sessions', 'pending', 1),
  ])
  return a + b + s.filter(uploadable).length > 0
}

/**
 * Upload everything this device changed. Sessions go first so the answers
 * that point at them find them. Refused records move to `deadLetters`
 * instead of being retried forever; the server's rebuilt progress replaces
 * the local copy for every question it touched.
 */
export async function push(transport: SyncTransport) {
  const db = await openLocalDb()
  const sessions = (await db.getAllFromIndex('sessions', 'pending', 1)).filter(uploadable)
  const attempts = await db.getAllFromIndex('attempts', 'pending', 1)
  const bookmarks = await db.getAllFromIndex('bookmarkEvents', 'pending', 1)
  let refused = 0

  for (let i = 0; i < sessions.length; i += SESSIONS_PER_CALL) {
    const batch = sessions.slice(i, i + SESSIONS_PER_CALL)
    const result = await transport.push({ sessions: batch.map(toSession), attempts: [], bookmarkEvents: [] })
    refused += await settle(db, result, { sessions: batch })
  }
  for (let i = 0; i < Math.max(attempts.length, bookmarks.length); i += RECORDS_PER_CALL) {
    const a = attempts.slice(i, i + RECORDS_PER_CALL)
    const b = bookmarks.slice(i, i + RECORDS_PER_CALL)
    const result = await transport.push({ sessions: [], attempts: a.map(toAttempt), bookmarkEvents: b.map(toBookmark) })
    refused += await settle(db, result, { attempts: a, bookmarks: b })
  }
  return { sent: sessions.length + attempts.length + bookmarks.length, refused }
}

async function settle(
  db: LocalDb,
  result: Awaited<ReturnType<SyncTransport['push']>>,
  sent: { sessions?: LocalSession[]; attempts?: LocalAttempt[]; bookmarks?: LocalBookmarkEvent[] },
) {
  const refused = new Map<string, SyncRejection>(result.rejected.map((r) => [`${r.kind}:${r.id}`, r]))
  const at = new Date()
  const tx = db.transaction(['sessions', 'attempts', 'bookmarkEvents', 'deadLetters', 'progress'], 'readwrite')
  for (const s of sent.sessions ?? []) {
    const r = refused.get(`session:${s.id}`)
    if (r) void tx.objectStore('deadLetters').put({ ...r, record: s, at })
    // A session changed again during the upload stays queued.
    const current = await tx.objectStore('sessions').get(s.id)
    if (current && (current.rev ?? 0) === (s.rev ?? 0)) void tx.objectStore('sessions').put({ ...current, pending: 0 })
  }
  for (const a of sent.attempts ?? []) {
    const r = refused.get(`attempt:${a.clientId ?? a.id}`)
    if (r) {
      void tx.objectStore('deadLetters').put({ ...r, record: a, at })
      void tx.objectStore('attempts').delete(a.id)
    } else {
      void tx.objectStore('attempts').put({ ...a, pending: 0 })
    }
  }
  for (const b of sent.bookmarks ?? []) {
    const r = refused.get(`bookmark:${b.clientId}`)
    if (r) {
      void tx.objectStore('deadLetters').put({ ...r, record: b, at })
      void tx.objectStore('bookmarkEvents').delete(b.clientId)
    } else {
      void tx.objectStore('bookmarkEvents').put({ ...b, pending: 0 })
    }
  }
  for (const p of result.progress) void tx.objectStore('progress').put(p)
  await tx.done
  return refused.size
}
