/**
 * End-to-end check of the sync API (src/server/sync.server.ts) against the
 * real database. Uses three untouched questions and fresh client ids, then
 * deletes everything it wrote and restores their progress exactly.
 *
 * Usage: npx tsx scripts/sync-smoke.ts
 */
import { randomUUID } from 'node:crypto'

import { config } from 'dotenv'
import { inArray, sql } from 'drizzle-orm'

config({ path: '.env', quiet: true })

const { getDb } = await import('../src/db/client.server.ts')
const { attempts, bookmarkEvents, questionProgress, studySessions, studySessionItems } = await import(
  '../src/db/schema.ts'
)
const { SYNC_PROTOCOL, pushChangesInput } = await import('../src/lib/schemas/sync.ts')
const { applyPush, attemptsSince, loadManifest, loadSyncQuestions, progressSince, sessionsSince } = await import(
  '../src/server/sync.server.ts'
)

const db = getDb()
let failures = 0
const check = (label: string, ok: boolean, detail: unknown = '') => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`)
}
const push = (p: Record<string, unknown>) => applyPush(pushChangesInput.parse({ protocol: SYNC_PROTOCOL, ...p }))

// Three eligible, ungrouped questions nobody has touched yet.
const candidates = (await db.execute(sql`
  select q.id from questions q
  where q.status in ('auto', 'verified') and q.duplicate_of_ref is null and q.answer_key is not null
    and q.requires_image = false and q.group_id is null
    and not exists (select 1 from question_progress p where p.question_id = q.id)
    and not exists (select 1 from study_session_items i where i.question_id = q.id)
    and not exists (select 1 from attempts a where a.question_id = q.id)
  order by q.id limit 3`)) as unknown as { rows: { id: number }[] }
const ids = candidates.rows.map((r) => r.id)
const [q0, q1, q2] = await loadSyncQuestions(ids)
const key = (q: typeof q0) => q.view.answerKey
const wrong = (q: typeof q0) => q.view.choices.find((c) => c.key !== q.view.answerKey)!.key
const snapshot = await db.select().from(questionProgress).where(inArray(questionProgress.questionId, ids))

const started = new Date()
const T = (s: number) => new Date(started.getTime() - 10 * 60_000 + s * 1000)
const sessionId = randomUUID()
const ours = { attempts: [] as string[], bookmarks: [] as string[] }
const attempt = (questionId: number, selectedKey: string, at: Date, extra: Record<string, unknown> = {}) => {
  const clientId = randomUUID()
  ours.attempts.push(clientId)
  return { clientId, questionId, sessionId, mode: 'practice', selectedKey, selfGrade: null, responseMs: 900, answeredAt: at, ...extra }
}
const item = (position: number, questionId: number, selectedKey: string | null, at: Date | null, isCorrect: boolean | null = null) => ({
  position,
  questionId,
  selectedKey,
  isCorrect,
  answeredAt: at,
  responseMs: at ? 900 : null,
  flagged: false,
})
const session = (status: string, items: ReturnType<typeof item>[], completedAt: Date | null = null) => ({
  id: sessionId,
  mode: 'practice',
  status,
  filters: { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all' },
  orderMode: 'smart',
  startedAt: T(0),
  durationSec: null,
  expiresAt: null,
  completedAt,
  autoSubmitted: false,
  items,
})
const progressOf = (rows: { questionId: number; box: number; seenCount: number; bookmarked: boolean; lastCorrect: boolean | null }[], id: number) =>
  rows.find((r) => r.questionId === id)

try {
  console.log(`questions ${ids.join(', ')}\n`)

  // 1. Device A: two answers (one claiming to be right while wrong) and a bookmark.
  const bookmark = randomUUID()
  ours.bookmarks.push(bookmark)
  const first = {
    sessions: [
      session('active', [item(0, q0.view.id, key(q0), T(1)), item(1, q1.view.id, wrong(q1), T(2), true), item(2, q2.view.id, null, null)]),
    ],
    attempts: [attempt(q0.view.id, key(q0), T(1)), attempt(q1.view.id, wrong(q1), T(2))],
    bookmarkEvents: [{ clientId: bookmark, questionId: q2.view.id, bookmarked: true, at: T(3) }],
  }
  const r1 = await push(first)
  check('first push accepted', r1.rejected.length === 0 && r1.accepted.attempts === 2 && r1.accepted.bookmarkEvents === 1, r1.accepted)
  check('right answer outside the deck stays in box 0', progressOf(r1.progress, q0.view.id)?.box === 0)
  check('client claim ignored: wrong answer graded wrong (box 1)', progressOf(r1.progress, q1.view.id)?.lastCorrect === false && progressOf(r1.progress, q1.view.id)?.box === 1)
  check('bookmark puts the card in box 1', progressOf(r1.progress, q2.view.id)?.box === 1 && progressOf(r1.progress, q2.view.id)?.bookmarked === true)
  const [s1] = await db.select().from(studySessions).where(inArray(studySessions.id, [sessionId]))
  check('session counts recomputed on the server', s1.answeredCount === 2 && s1.correctCount === 1 && s1.status === 'active', { answered: s1.answeredCount, correct: s1.correctCount })

  // 2. Re-sending the same changes is harmless.
  const r2 = await push(first)
  const [{ n: stored }] = await db.select({ n: sql<number>`count(*)::int` }).from(attempts).where(inArray(attempts.clientId, ours.attempts))
  check('re-send stores no duplicates', stored === 2 && JSON.stringify(r2.progress.map((p) => p.box)) === JSON.stringify(r1.progress.map((p) => p.box)), { stored })

  // 3. Device B answered the same session: the union wins, earliest answer per item.
  const r3 = await push({
    sessions: [
      session('completed', [item(0, q0.view.id, wrong(q0), T(5)), item(1, q1.view.id, null, null), item(2, q2.view.id, key(q2), T(4))], T(6)),
    ],
    attempts: [attempt(q2.view.id, key(q2), T(4))],
  })
  const items = await db.select().from(studySessionItems).where(inArray(studySessionItems.sessionId, [sessionId]))
  const at = (p: number) => items.find((i) => i.position === p)!
  const [s3] = await db.select().from(studySessions).where(inArray(studySessions.id, [sessionId]))
  check('earliest answer kept per item', at(0).selectedKey === key(q0) && at(1).selectedKey === wrong(q1) && at(2).selectedKey === key(q2))
  check('merged session completed with server counts', s3.status === 'completed' && s3.answeredCount === 3 && s3.correctCount === 2, { status: s3.status, answered: s3.answeredCount, correct: s3.correctCount })
  check('bookmark then right answer → box 2', progressOf(r3.progress, q2.view.id)?.box === 2)

  // 4. Bad records are refused one by one; the good one still lands.
  const r4 = await push({
    attempts: [
      attempt(2_147_000_000, 'A', T(7)),
      attempt(q0.view.id, key(q0), new Date(Date.now() + 3_600_000)),
      attempt(q1.view.id, key(q1), T(7)),
    ],
    sessions: [{ ...session('active', [item(0, q0.view.id, null, null), item(2, q1.view.id, null, null)]), id: randomUUID() }],
  })
  check('two bad attempts and a bad session refused', r4.rejected.length === 3, r4.rejected.map((r) => r.reason))
  check('the valid attempt still counted (wrong → right: box 2)', r4.accepted.attempts === 1 && progressOf(r4.progress, q1.view.id)?.box === 2)

  // 5. Two devices uploading at once: both kept, progress matches the full history.
  await Promise.all([push({ attempts: [attempt(q0.view.id, wrong(q0), T(8), { sessionId: null })] }), push({ attempts: [attempt(q0.view.id, key(q0), T(9), { sessionId: null })] })])
  const [p0] = await db.select().from(questionProgress).where(inArray(questionProgress.questionId, [q0.view.id]))
  check('concurrent uploads both counted', p0.seenCount === 3 && p0.box === 2 && p0.lastCorrect === true, { seen: p0.seenCount, box: p0.box })

  // 6. Pulls.
  const since = new Date(started.getTime() - 1000)
  const pulledProgress = await progressSince(since, null)
  check('progress pull has all three', ids.every((id) => pulledProgress.rows.some((r) => r.questionId === id)))
  const pulledSessions = await sessionsSince(since, null)
  const mine = pulledSessions.rows.find((s) => s.id === sessionId)
  check('session pull has the merged session and its items', mine?.items.length === 3 && mine.status === 'completed')
  const pulledAttempts = await attemptsSince(since, null)
  check('attempt pull has every accepted answer', ours.attempts.filter((id) => pulledAttempts.rows.some((a) => a.clientId === id)).length === 6)
  const page1 = await progressSince(null, null, 5)
  const page2 = page1.next ? await progressSince(null, page1.next, 5) : { rows: [] }
  check('keyset pages don’t overlap', page1.next !== null && !page2.rows.some((r) => page1.rows.some((p) => p.questionId === r.questionId)))

  // 7. Manifest + content.
  const manifest = await loadManifest(null)
  const again = await loadManifest(manifest.hash)
  check('manifest lists the questions', !manifest.unchanged && ids.every((id) => manifest.questions.some((q) => q.id === id)), manifest.unchanged ? '' : `${manifest.questions.length} questions, ${manifest.images.length} images`)
  check('unchanged when the device already has it', again.unchanged)
  check('content comes with answers and the index', q0.view.answerKey !== undefined && q0.index.eligible && q0.view.bookmarked === false)
} catch (e) {
  failures++
  console.error('✗ crashed:', e)
} finally {
  // Remove everything this run wrote, then put progress back exactly.
  await db.delete(attempts).where(inArray(attempts.clientId, ours.attempts))
  await db.delete(bookmarkEvents).where(inArray(bookmarkEvents.clientId, ours.bookmarks))
  // (The rejected session in step 4 was never stored.)
  await db.delete(studySessions).where(inArray(studySessions.id, [sessionId]))
  await db.delete(questionProgress).where(inArray(questionProgress.questionId, ids))
  if (snapshot.length) await db.insert(questionProgress).values(snapshot)
  const after = await db.select().from(questionProgress).where(inArray(questionProgress.questionId, ids))
  const [{ left }] = await db
    .select({ left: sql<number>`count(*)::int` })
    .from(attempts)
    .where(inArray(attempts.questionId, ids))
  console.log(`\ncleanup: ${after.length === snapshot.length && left === 0 ? 'restored exactly' : 'DIFFERENCES'} (progress rows ${after.length}, attempts left ${left})`)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll sync checks passed')
process.exit(failures ? 1 : 0)
