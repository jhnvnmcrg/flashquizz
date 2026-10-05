/**
 * End-to-end check of the sync API (src/server/sync.server.ts) against the
 * real database, as two made-up people (A and B) so nobody's real progress
 * is touched: everything written belongs to their test user IDs and is
 * deleted at the end. Uses questions nobody has studied yet.
 *
 * Usage: npx tsx scripts/sync-smoke.ts
 */
import { randomUUID } from 'node:crypto'

import { config } from 'dotenv'
import { and, eq, inArray, sql } from 'drizzle-orm'

config({ path: '.env', quiet: true })

const { getDb } = await import('../src/db/client.server.ts')
const { attempts, bookmarkEvents, questionProgress, questions, studySessions, studySessionItems } = await import(
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
const run = randomUUID().replaceAll('-', '').slice(0, 12)
const A = `user_smokeA${run}`
const B = `user_smokeB${run}`
const users = [A, B]
const push = (userId: string, p: Record<string, unknown>) =>
  applyPush(userId, pushChangesInput.parse({ protocol: SYNC_PROTOCOL, ...p }))

// Four eligible, ungrouped questions nobody has touched yet.
const candidates = (await db.execute(sql`
  select q.id from questions q
  where q.status in ('auto', 'verified') and q.duplicate_of_ref is null and q.answer_key is not null
    and q.requires_image = false and q.group_id is null
    and not exists (select 1 from question_progress p where p.question_id = q.id)
    and not exists (select 1 from study_session_items i where i.question_id = q.id)
    and not exists (select 1 from attempts a where a.question_id = q.id)
  order by q.id limit 4`)) as unknown as { rows: { id: number }[] }
const [q0, q1, q2, q3] = await loadSyncQuestions(candidates.rows.map((r) => r.id))
const ids = [q0, q1, q2].map((q) => q.view.id)
const key = (q: typeof q0) => q.view.answerKey
const wrong = (q: typeof q0) => q.view.choices.find((c) => c.key !== q.view.answerKey)!.key
type Manifest = Awaited<ReturnType<typeof loadManifest>>
const lists = (m: Manifest, id: number) => !m.unchanged && m.questions.some((q) => q.id === id)

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
  console.log(`questions ${[...ids, q3.view.id].join(', ')}, people ${A} and ${B}\n`)

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
  const r1 = await push(A, first)
  check('first push accepted', r1.rejected.length === 0 && r1.accepted.attempts === 2 && r1.accepted.bookmarkEvents === 1, r1.accepted)
  check('right answer outside the deck stays in box 0', progressOf(r1.progress, q0.view.id)?.box === 0)
  check('client claim ignored: wrong answer graded wrong (box 1)', progressOf(r1.progress, q1.view.id)?.lastCorrect === false && progressOf(r1.progress, q1.view.id)?.box === 1)
  check('bookmark puts the card in box 1', progressOf(r1.progress, q2.view.id)?.box === 1 && progressOf(r1.progress, q2.view.id)?.bookmarked === true)
  const [s1] = await db.select().from(studySessions).where(inArray(studySessions.id, [sessionId]))
  check('session counts recomputed on the server', s1.answeredCount === 2 && s1.correctCount === 1 && s1.status === 'active', { answered: s1.answeredCount, correct: s1.correctCount })

  // 2. Re-sending the same changes is harmless.
  const r2 = await push(A, first)
  const [{ n: stored }] = await db.select({ n: sql<number>`count(*)::int` }).from(attempts).where(inArray(attempts.clientId, ours.attempts))
  check('re-send stores no duplicates', stored === 2 && JSON.stringify(r2.progress.map((p) => p.box)) === JSON.stringify(r1.progress.map((p) => p.box)), { stored })

  // 3. Device B answered the same session: the union wins, earliest answer per item.
  const r3 = await push(A, {
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
  const r4 = await push(A, {
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
  await Promise.all([push(A, { attempts: [attempt(q0.view.id, wrong(q0), T(8), { sessionId: null })] }), push(A, { attempts: [attempt(q0.view.id, key(q0), T(9), { sessionId: null })] })])
  const [p0] = await db.select().from(questionProgress).where(and(eq(questionProgress.userId, A), eq(questionProgress.questionId, q0.view.id)))
  check('concurrent uploads both counted', p0.seenCount === 3 && p0.box === 2 && p0.lastCorrect === true, { seen: p0.seenCount, box: p0.box })

  // 6. Pulls.
  const since = new Date(started.getTime() - 1000)
  const pulledProgress = await progressSince(A, since, null)
  check('progress pull has all three', ids.every((id) => pulledProgress.rows.some((r) => r.questionId === id)))
  const pulledSessions = await sessionsSince(A, since, null)
  const mine = pulledSessions.rows.find((s) => s.id === sessionId)
  check('session pull has the merged session and its items', mine?.items.length === 3 && mine.status === 'completed')
  const pulledAttempts = await attemptsSince(A, since, null)
  check('attempt pull has every accepted answer', ours.attempts.filter((id) => pulledAttempts.rows.some((a) => a.clientId === id)).length === 6)
  const page1 = await progressSince(A, null, null, 2)
  const page2 = page1.next ? await progressSince(A, null, page1.next, 2) : { rows: [] }
  check('keyset pages don’t overlap', page1.next !== null && page2.rows.length > 0 && !page2.rows.some((r) => page1.rows.some((p) => p.questionId === r.questionId)))

  // 7. A second person sees none of A's work and can't touch A's session.
  const bPulls = await Promise.all([progressSince(B, null, null), sessionsSince(B, null, null), attemptsSince(B, null, null)])
  check('B pulls nothing of A’s', bPulls.every((p) => p.rows.length === 0), bPulls.map((p) => p.rows.length))
  const [before] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId))
  const intruder = await push(B, {
    sessions: [session('completed', [item(0, q0.view.id, wrong(q0), T(10)), item(1, q1.view.id, wrong(q1), T(10)), item(2, q2.view.id, wrong(q2), T(10))], T(11))],
    // Points at A's session, which isn't B's.
    attempts: [attempt(q3.view.id, key(q3), T(10))],
  })
  const [after] = await db.select().from(studySessions).where(eq(studySessions.id, sessionId))
  check('B can’t reuse A’s session id', intruder.rejected.some((r) => r.reason === 'session id already taken') && after.userId === A && after.correctCount === before.correctCount && after.updatedAt.getTime() === before.updatedAt.getTime(), intruder.rejected.map((r) => r.reason))
  const [bAttempt] = await db.select().from(attempts).where(and(eq(attempts.userId, B), eq(attempts.questionId, q3.view.id)))
  check('B’s answer is stored, not linked to A’s session', bAttempt !== undefined && bAttempt.sessionId === null)
  check('B’s progress is B’s own', progressOf(intruder.progress, q3.view.id)?.seenCount === 1 && intruder.progress.length === 1)
  const aProgress = await progressSince(A, null, null)
  check('A’s progress untouched by B', aProgress.rows.length === 3 && !aProgress.rows.some((r) => r.questionId === q3.view.id))
  const same = await push(B, { attempts: [attempt(q0.view.id, wrong(q0), T(12), { sessionId: null })] })
  const [aP0] = await db.select().from(questionProgress).where(and(eq(questionProgress.userId, A), eq(questionProgress.questionId, q0.view.id)))
  check('same question, separate progress', progressOf(same.progress, q0.view.id)?.seenCount === 1 && aP0.seenCount === 3, { b: progressOf(same.progress, q0.view.id)?.seenCount, a: aP0.seenCount })

  // 8. Manifest + content.
  const [held] = await db.select({ id: questions.id }).from(questions).where(eq(questions.status, 'needs_review')).limit(1)
  if (held) await push(A, { sessions: [{ ...session('active', [item(0, held.id, null, null)]), id: randomUUID() }] })
  const manifestA = await loadManifest(A, true, null)
  const manifestB = await loadManifest(B, false, null)
  const again = await loadManifest(A, true, manifestA.hash)
  check('manifest lists the questions', ids.every((id) => lists(manifestA, id)), manifestA.unchanged ? '' : `${manifestA.questions.length} questions, ${manifestA.images.length} images`)
  check('unchanged when the device already has it', again.unchanged)
  if (held) check('a held-back question in A’s session goes to A’s device only', lists(manifestA, held.id) && !lists(manifestB, held.id))
  const [{ n: needsReview }] = await db.select({ n: sql<number>`count(*)::int` }).from(questions).where(eq(questions.status, 'needs_review'))
  check('only admins hear how many questions need checking', !manifestA.unchanged && !manifestB.unchanged && manifestA.needsReview === needsReview && manifestB.needsReview === 0, { admin: manifestA.unchanged ? null : manifestA.needsReview, member: manifestB.unchanged ? null : manifestB.needsReview })
  check('content comes with answers and the index', q0.view.answerKey !== undefined && q0.index.eligible && q0.view.bookmarked === false)
} catch (e) {
  failures++
  console.error('✗ crashed:', e)
} finally {
  // Remove everything the two test people wrote (session items go with their sessions).
  await db.delete(attempts).where(inArray(attempts.userId, users))
  await db.delete(bookmarkEvents).where(inArray(bookmarkEvents.userId, users))
  await db.delete(studySessions).where(inArray(studySessions.userId, users))
  await db.delete(questionProgress).where(inArray(questionProgress.userId, users))
  const counts = await Promise.all(
    [attempts, bookmarkEvents, studySessions, questionProgress].map((table) =>
      db.select({ n: sql<number>`count(*)::int` }).from(table).where(inArray(table.userId, users)),
    ),
  )
  const left = counts.reduce((sum, [{ n }]) => sum + n, 0)
  const [{ items }] = await db
    .select({ items: sql<number>`count(*)::int` })
    .from(studySessionItems)
    .where(inArray(studySessionItems.questionId, [...ids, q3.view.id]))
  console.log(`\ncleanup: ${left === 0 && items === 0 ? 'nothing left behind' : `DIFFERENCES (${left} rows, ${items} session items left)`}`)
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll sync checks passed')
process.exit(failures ? 1 : 0)
