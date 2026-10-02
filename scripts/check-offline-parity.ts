/**
 * Read-only check that the browser-side study logic (src/lib/study/*) gives the
 * same answers as today's SQL on the real database:
 *   - tallies, candidate selection for every scope, day buckets, upcoming
 *     reviews and box counts must match exactly;
 *   - progress rebuilt from attempts + bookmarks is compared with the stored
 *     progress rows. The only expected differences are questions that were
 *     bookmarked and later un-bookmarked (that history was never recorded).
 *
 * Usage: npx tsx scripts/check-offline-parity.ts
 */
import { config } from 'dotenv'
import { asc, desc, eq, sql } from 'drizzle-orm'

config({ path: '.env', quiet: true })

const { getDb } = await import('../src/db/client.server.ts')
const schema = await import('../src/db/schema.ts')
const { eligibleQuestion } = await import('../src/server/eligibility.server.ts')
const { topicTallies: sqlTallies } = await import('../src/server/stats.server.ts')
const { selectCandidates: sqlCandidates } = await import('../src/server/session-select.server.ts')
const { STUDY_TIMEZONE } = await import('../src/lib/constants.ts')
const { selectCandidates, retryIdsFrom } = await import('../src/lib/study/candidates.ts')
const { topicTallies, dayKey, todayTotals, upcomingDue, boxCounts } = await import('../src/lib/study/stats.ts')
const { foldAll } = await import('../src/lib/study/progress-fold.ts')

type IndexedQuestion = import('../src/lib/study/candidates.ts').IndexedQuestion
type ProgressState = import('../src/lib/leitner.ts').ProgressState
type StudyFilters = import('../src/lib/schemas/study.ts').StudyFilters
type ProgressEvent = import('../src/lib/study/progress-fold.ts').ProgressEvent

const { questions, modules, sources, questionProgress, attempts, studySessions, studySessionItems } = schema
const db = getDb()
const now = new Date()
let failures = 0

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sortedIds = (rows: { id: number }[]) => rows.map((r) => r.id).sort((a, b) => a - b)

// --- the device's in-memory index, built from the same rows the server sees ---
const indexRows = await db
  .select({
    id: questions.id,
    moduleId: questions.moduleId,
    moduleSlug: modules.slug,
    topicId: questions.topicId,
    sourceSlug: sources.slug,
    groupId: questions.groupId,
    groupOrder: questions.groupOrder,
    sourceSort: sources.sortOrder,
    moduleSort: modules.sortOrder,
    ordinal: questions.ordinal,
    eligible: sql<boolean>`coalesce(${eligibleQuestion()}, false)`,
  })
  .from(questions)
  .innerJoin(modules, eq(modules.id, questions.moduleId))
  .innerJoin(sources, eq(sources.id, questions.sourceId))
const index: IndexedQuestion[] = indexRows.map((r) => ({
  id: r.id,
  moduleId: r.moduleId,
  moduleSlug: r.moduleSlug,
  topicId: r.topicId,
  sourceSlug: r.sourceSlug,
  groupId: r.groupId,
  groupOrder: r.groupOrder,
  sortKey: [r.sourceSort, r.moduleSort, r.ordinal],
  eligible: r.eligible,
}))
const progressRows = await db.select().from(questionProgress)
const progress = new Map<number, ProgressState & { questionId: number }>(progressRows.map((p) => [p.questionId, p]))
console.log(
  `${index.length} questions (${index.filter((q) => q.eligible).length} eligible), ${progress.size} progress rows\n`,
)

// --- tallies ---
const js = topicTallies(index, progress, now)
const db_ = await sqlTallies()
check('overall tally', sameJson(js.overall, db_.overall), JSON.stringify(js.overall))
const mapEq = (a: Map<number, unknown>, b: Map<number, unknown>) =>
  a.size === b.size && [...a].every(([k, v]) => sameJson(v, b.get(k)))
check('tally per module', mapEq(js.byModule, db_.byModule), `${js.byModule.size} modules`)
check('tally per topic', mapEq(js.byTopic, db_.byTopic), `${js.byTopic.size} topics`)

// --- candidate selection ---
const base: StudyFilters = { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all', fromSessionId: null }
const someTopic = index.find((q) => q.eligible && q.topicId !== null)?.topicId
const cases: [string, StudyFilters][] = [
  ...(['all', 'unseen', 'mistakes', 'bookmarked', 'due'] as const).map(
    (scope) => [`scope ${scope}`, { ...base, scope }] as [string, StudyFilters],
  ),
  ['module m4', { ...base, moduleSlugs: ['m4'] }],
  ['modules m1+m6, unseen', { ...base, moduleSlugs: ['m1', 'm6'], scope: 'unseen' }],
  ...(someTopic ? [[`topic ${someTopic}`, { ...base, topicIds: [someTopic] }] as [string, StudyFilters]] : []),
  ['source pb1', { ...base, sourceSlugs: ['pb1'] }],
]
const [lastWithMisses] = await db
  .select({ id: studySessionItems.sessionId })
  .from(studySessionItems)
  .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
  .where(sql`${studySessionItems.isCorrect} is not true`)
  .orderBy(desc(studySessions.startedAt))
  .limit(1)
let retryIds: Set<number> | undefined
if (lastWithMisses) {
  cases.push([`retry session ${lastWithMisses.id.slice(0, 8)}`, { ...base, fromSessionId: lastWithMisses.id }])
  const items = await db
    .select({ questionId: studySessionItems.questionId, isCorrect: studySessionItems.isCorrect })
    .from(studySessionItems)
    .where(eq(studySessionItems.sessionId, lastWithMisses.id))
  retryIds = retryIdsFrom(items)
}
for (const [label, f] of cases) {
  const mine = sortedIds(selectCandidates({ index, progress, filters: f, now, retryIds }))
  const theirs = sortedIds(await sqlCandidates(f))
  check(`candidates: ${label}`, sameJson(mine, theirs), `${mine.length} vs ${theirs.length}`)
}

// --- day buckets (today, streak days) ---
const attemptRows = await db
  .select({
    id: attempts.id,
    questionId: attempts.questionId,
    isCorrect: attempts.isCorrect,
    answeredAt: attempts.answeredAt,
  })
  .from(attempts)
  .orderBy(asc(attempts.answeredAt))
const sqlDays = await db
  .select({ day: sql<string>`to_char(date(${attempts.answeredAt} at time zone ${STUDY_TIMEZONE}), 'YYYY-MM-DD')` })
  .from(attempts)
  .groupBy(sql`1`)
const jsDays = [...new Set(attemptRows.map((a) => dayKey(a.answeredAt)))].sort()
check(
  'Manila day of every attempt',
  sameJson(
    jsDays,
    sqlDays.map((d) => d.day).sort(),
  ),
  `${jsDays.length} study days`,
)
const [sqlToday] = await db
  .select({
    answered: sql<number>`count(*)::int`,
    correct: sql<number>`count(*) filter (where ${attempts.isCorrect})::int`,
  })
  .from(attempts)
  .where(sql`date(${attempts.answeredAt} at time zone ${STUDY_TIMEZONE}) = date(now() at time zone ${STUDY_TIMEZONE})`)
check('today totals', sameJson(todayTotals(attemptRows, now), sqlToday), JSON.stringify(sqlToday))

// --- review hub: upcoming per day, box counts ---
const sqlUpcoming = await db
  .select({
    day: sql<string>`to_char(date(${questionProgress.dueAt} at time zone ${STUDY_TIMEZONE}), 'YYYY-MM-DD')`,
    n: sql<number>`count(*)::int`,
  })
  .from(questionProgress)
  .where(sql`${questionProgress.box} > 0 and ${questionProgress.dueAt} > now() and ${questionProgress.dueAt} < now() + interval '14 days'`)
  .groupBy(sql`1`)
  .orderBy(asc(sql`1`))
check('upcoming reviews per day', sameJson(upcomingDue(progress.values(), now), sqlUpcoming), `${sqlUpcoming.length} days`)
const sqlBoxes = await db
  .select({ box: questionProgress.box, n: sql<number>`count(*)::int` })
  .from(questionProgress)
  .where(sql`${questionProgress.box} > 0`)
  .groupBy(questionProgress.box)
  .orderBy(asc(questionProgress.box))
check('cards per box', sameJson(boxCounts(progress.values()), sqlBoxes), JSON.stringify(sqlBoxes))

// --- progress rebuilt from history vs stored rows ---
const events: (ProgressEvent & { questionId: number })[] = attemptRows.map((a) => ({
  kind: 'answer',
  id: `a:${String(a.id).padStart(12, '0')}`,
  at: a.answeredAt,
  correct: a.isCorrect,
  questionId: a.questionId,
}))
// The planned backfill: one bookmark event per currently bookmarked question.
for (const p of progress.values()) {
  if (p.bookmarked) events.push({ kind: 'bookmark', id: `b:${p.questionId}`, at: p.bookmarkedAt ?? p.lastAnsweredAt ?? now, bookmarked: true, questionId: p.questionId })
}
const rebuilt = foldAll(events)
const FIELDS = ['box', 'dueAt', 'seenCount', 'correctCount', 'wrongCount', 'streak', 'lastCorrect', 'lastAnsweredAt', 'bookmarked', 'bookmarkedAt'] as const
const diffs: { questionId: number; fields: string[] }[] = []
for (const [questionId, stored] of progress) {
  const mine = rebuilt.get(questionId)
  const fields = FIELDS.filter((f) => JSON.stringify(mine?.[f] ?? null) !== JSON.stringify(stored[f] ?? null))
  if (fields.length) diffs.push({ questionId, fields })
}
const unexplained = diffs.filter((d) => !d.fields.every((f) => f === 'box' || f === 'dueAt'))
check(
  'progress rebuilt from attempts + bookmarks',
  unexplained.length === 0,
  `${progress.size - diffs.length}/${progress.size} identical; ${diffs.length - unexplained.length} differ only in box/dueAt (un-bookmarked history); ${unexplained.length} other`,
)
for (const d of unexplained.slice(0, 10)) console.log(`   question ${d.questionId}: ${d.fields.join(', ')}`)

console.log(failures ? `\n${failures} check(s) failed` : '\nAll parity checks passed')
process.exit(failures ? 1 : 0)
