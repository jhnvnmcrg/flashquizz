import { createHash } from 'node:crypto'

import { and, asc, eq, gte, inArray, isNotNull, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { getDb } from '#/db/client.server'
import { type Tx, withTransaction } from '#/db/client-tx.server'
import {
  attempts,
  bookmarkEvents,
  modules,
  questionGroups,
  questionImages,
  questionProgress,
  questions,
  sources,
  studySessionItems,
  studySessions,
  topics,
} from '#/db/schema'
import type { ChoiceKey } from '#/lib/schemas/enums'
import type { Keyset, PushChanges, SessionUpload, SyncRejection } from '#/lib/schemas/sync'
import { isAnswerCorrect } from '#/lib/study/grading'
import { attemptEventId, foldAll, type ProgressEvent } from '#/lib/study/progress-fold'
import { type MergeItem, mergeSession } from '#/lib/study/session-merge'

import { eligibleQuestion } from './eligibility.server'
import { loadQuestionViews } from './question-payload.server'
import { loadTaxonomy } from './taxonomy.server'

const DAY_MS = 86_400_000
/** The device's first pull of attempts reaches this far back (for the study streak). */
const ATTEMPT_HISTORY_DAYS = 120
/** Clock skew allowed between a device and the server. */
const SKEW_MS = 5 * 60_000
const EARLIEST = new Date('2020-01-01T00:00:00Z')
/** Serialises uploads from several devices (pg_advisory_xact_lock key). */
const SYNC_LOCK = 417_023

function groupBy<T, K>(items: readonly T[], key: (item: T) => K) {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

// ── Content: what each device should hold ───────────────────────────────────

const asText = (x: SQL | AnyPgColumn) => sql`coalesce((${x})::text, '')`
const eligibleSql = sql<boolean>`coalesce((${eligibleQuestion()}), false)`

/** Changes whenever anything shown for the question changes (text, images, module, eligibility). */
const questionHash = sql<string>`left(md5(concat_ws('|', ${sql.join(
  [
    questions.format,
    questions.stem,
    questions.statements,
    questions.choices,
    questions.answerKey,
    questions.rationale,
    questions.mnemonic,
    questions.printedNumber,
    questions.groupId,
    questions.groupOrder,
    questions.ordinal,
    questions.status,
    questions.topicId,
    questions.moduleId,
    questions.sourceId,
    questionGroups.context,
    modules.slug,
    modules.code,
    modules.shortName,
    modules.accentHue,
    modules.sortOrder,
    topics.name,
    sources.slug,
    sources.shortName,
    sources.sortOrder,
    sql`(select string_agg(concat_ws(',', qi.id, qi.role, coalesce(qi.choice_key, ''), qi.alt, coalesce(qi.width::text, ''), coalesce(qi.height::text, ''), qi.sort_order), ';' order by qi.sort_order, qi.id) from question_images qi where qi.question_id = ${questions.id})`,
    eligibleSql,
  ].map(asText),
  sql`, `,
)})), 12)`

/** Eligible questions, plus any a session or bookmark still points at (so history renders). */
const onDevice = sql`(${eligibleSql} or ${questions.id} in (select ${studySessionItems.questionId} from ${studySessionItems} union select ${questionProgress.questionId} from ${questionProgress} where ${questionProgress.bookmarked}))`

function questionRows(where: SQL) {
  return getDb()
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
      eligible: eligibleSql,
      archived: sql<boolean>`${questions.status} = 'archived'`,
      h: questionHash,
    })
    .from(questions)
    .innerJoin(modules, eq(modules.id, questions.moduleId))
    .innerJoin(sources, eq(sources.id, questions.sourceId))
    .leftJoin(topics, eq(topics.id, questions.topicId))
    .leftJoin(questionGroups, eq(questionGroups.id, questions.groupId))
    .where(where)
    .orderBy(asc(questions.id))
}

/**
 * What the device should hold, as content hashes. When `clientHash` matches,
 * only `unchanged` comes back. `serverTime` is read first, so anything
 * committed during the pull is picked up next time.
 */
export async function loadManifest(clientHash: string | null) {
  const serverTime = new Date()
  const db = getDb()
  const [rows, taxonomy, perModuleSource, needsReview, images] = await Promise.all([
    questionRows(onDevice),
    loadTaxonomy(),
    db
      .select({
        moduleId: questions.moduleId,
        slug: sources.slug,
        shortName: sources.shortName,
        n: sql<number>`count(*)::int`,
      })
      .from(questions)
      .innerJoin(sources, eq(sources.id, questions.sourceId))
      .groupBy(questions.moduleId, sources.slug, sources.shortName, sources.sortOrder)
      .orderBy(asc(sources.sortOrder)),
    db.select({ n: sql<number>`count(*)::int` }).from(questions).where(eq(questions.status, 'needs_review')),
    db
      .select({ id: questionImages.id, questionId: questionImages.questionId, sha: questionImages.sha256 })
      .from(questionImages)
      .where(isNotNull(questionImages.questionId))
      .orderBy(asc(questionImages.id)),
  ])
  const held = new Set(rows.map((r) => r.id))
  const moduleSources: Record<number, { slug: string; shortName: string; n: number }[]> = {}
  for (const [moduleId, list] of groupBy(perModuleSource, (s) => s.moduleId)) {
    moduleSources[moduleId] = list.map(({ slug, shortName, n }) => ({ slug, shortName, n }))
  }
  const content = {
    questions: rows.map((r) => ({ id: r.id, h: r.h })),
    images: images
      .filter((i) => i.questionId !== null && held.has(i.questionId))
      .map((i) => ({ id: i.id, h: i.sha.slice(0, 12) })),
    taxonomy: { ...taxonomy, moduleSources },
    needsReview: needsReview[0]?.n ?? 0,
  }
  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)
  if (clientHash === hash) return { unchanged: true as const, hash, serverTime }
  return { unchanged: false as const, hash, serverTime, ...content }
}

export type SyncManifest = Awaited<ReturnType<typeof loadManifest>>

/** Full study payloads (with answers) plus the small index the device keeps in memory. */
export async function loadSyncQuestions(ids: number[]) {
  const [rows, views] = await Promise.all([questionRows(inArray(questions.id, ids)), loadQuestionViews(ids, true)])
  return rows.flatMap((r) => {
    const view = views.get(r.id)
    if (!view) return []
    return [
      {
        h: r.h,
        index: {
          id: r.id,
          moduleId: r.moduleId,
          moduleSlug: r.moduleSlug,
          topicId: r.topicId,
          sourceSlug: r.sourceSlug,
          groupId: r.groupId,
          groupOrder: r.groupOrder,
          sortKey: [r.sourceSort, r.moduleSort, r.ordinal] as [number, number, number],
          eligible: r.eligible,
          archived: r.archived,
        },
        // Bookmarks come from the device's own progress, not the content copy.
        view: { ...view, bookmarked: false } as typeof view & {
          answerKey: ChoiceKey
          rationale: string
          mnemonic: string
        },
      },
    ]
  })
}

export type SyncQuestion = Awaited<ReturnType<typeof loadSyncQuestions>>[number]

// ── Paged pulls: progress, sessions, attempts ────────────────────────────────

/** `(timestamp, id) > cursor`, compared at millisecond precision (JS Dates). */
function afterKeyset(at: AnyPgColumn, id: AnyPgColumn, after: Keyset, idType: 'int' | 'uuid' | 'bigint') {
  return sql`(date_trunc('milliseconds', ${at}), ${id}) > (${after.at.toISOString()}::timestamptz, ${after.id}::${sql.raw(idType)})`
}

export async function progressSince(since: Date | null, after: Keyset | null, limit = 1000) {
  const where = [
    since ? gte(questionProgress.updatedAt, since) : undefined,
    after ? afterKeyset(questionProgress.updatedAt, questionProgress.questionId, after, 'int') : undefined,
  ]
  const rows = await getDb()
    .select()
    .from(questionProgress)
    .where(and(...where))
    .orderBy(asc(questionProgress.updatedAt), asc(questionProgress.questionId))
    .limit(limit)
  const last = rows.at(-1)
  return { rows, next: rows.length === limit && last ? { at: last.updatedAt, id: String(last.questionId) } : null }
}

export async function sessionsSince(since: Date | null, after: Keyset | null, limit = 50) {
  const db = getDb()
  const where = [
    since ? gte(studySessions.updatedAt, since) : undefined,
    after ? afterKeyset(studySessions.updatedAt, studySessions.id, after, 'uuid') : undefined,
  ]
  const sessions = await db
    .select()
    .from(studySessions)
    .where(and(...where))
    .orderBy(asc(studySessions.updatedAt), asc(studySessions.id))
    .limit(limit)
  const items = sessions.length
    ? await db
        .select()
        .from(studySessionItems)
        .where(
          inArray(
            studySessionItems.sessionId,
            sessions.map((s) => s.id),
          ),
        )
        .orderBy(asc(studySessionItems.position))
    : []
  const bySession = groupBy(items, (i) => i.sessionId)
  const last = sessions.at(-1)
  return {
    rows: sessions.map((s) => ({ ...s, items: bySession.get(s.id) ?? [] })),
    next: sessions.length === limit && last ? { at: last.updatedAt, id: last.id } : null,
  }
}

export async function attemptsSince(since: Date | null, after: Keyset | null, limit = 2000) {
  const from = since ?? new Date(Date.now() - ATTEMPT_HISTORY_DAYS * DAY_MS)
  const rows = await getDb()
    .select({
      id: attempts.id,
      clientId: attempts.clientId,
      questionId: attempts.questionId,
      sessionId: attempts.sessionId,
      mode: attempts.mode,
      isCorrect: attempts.isCorrect,
      answeredAt: attempts.answeredAt,
      createdAt: attempts.createdAt,
    })
    .from(attempts)
    .where(
      and(gte(attempts.createdAt, from), after ? afterKeyset(attempts.createdAt, attempts.id, after, 'bigint') : undefined),
    )
    .orderBy(asc(attempts.createdAt), asc(attempts.id))
    .limit(limit)
  const last = rows.at(-1)
  return {
    rows: rows.map((r) => ({ ...r, id: String(r.id) })),
    next: rows.length === limit && last ? { at: last.createdAt, id: String(last.id) } : null,
  }
}

// ── Push: apply a device's changes ───────────────────────────────────────────

/** Why a session upload can't be stored, or null when it's fine. */
function sessionProblem(s: SessionUpload, known: ReadonlyMap<number, unknown>, plausible: (d: Date) => boolean) {
  const positions = s.items.map((i) => i.position).sort((a, b) => a - b)
  if (positions.some((p, i) => p !== i)) return 'positions must run 0..n-1 without gaps'
  if (new Set(s.items.map((i) => i.questionId)).size !== s.items.length) return 'a question appears twice'
  if (s.items.some((i) => !known.has(i.questionId))) return 'unknown question'
  if (s.mode === 'exam' && (s.durationSec === null || s.expiresAt === null)) return 'exam without a timer'
  if (!plausible(s.startedAt) || (s.completedAt && !plausible(s.completedAt))) return 'time out of range'
  if (s.items.some((i) => i.answeredAt && !plausible(i.answeredAt))) return 'answer time out of range'
  return null
}

/** Item results are recomputed here; only flashcard self-grades are taken as sent. */
function gradeItem(s: SessionUpload, i: SessionUpload['items'][number], answerKeys: ReadonlyMap<number, string | null>) {
  if (s.mode === 'flashcards') return i.answeredAt ? i.isCorrect : null
  // A mock exam is marked when submitted; blanks then count as wrong.
  if (s.mode === 'exam') {
    return s.status === 'completed'
      ? isAnswerCorrect({ mode: 'exam', selectedKey: i.selectedKey, answerKey: answerKeys.get(i.questionId) ?? null })
      : null
  }
  if (!i.answeredAt) return null
  return isAnswerCorrect({ mode: s.mode, selectedKey: i.selectedKey, answerKey: answerKeys.get(i.questionId) ?? null })
}

async function rebuildProgress(tx: Tx, questionIds: number[]) {
  if (!questionIds.length) return []
  const answers = await tx
    .select({
      id: attempts.id,
      clientId: attempts.clientId,
      questionId: attempts.questionId,
      isCorrect: attempts.isCorrect,
      answeredAt: attempts.answeredAt,
    })
    .from(attempts)
    .where(inArray(attempts.questionId, questionIds))
  const marks = await tx.select().from(bookmarkEvents).where(inArray(bookmarkEvents.questionId, questionIds))
  const events: (ProgressEvent & { questionId: number })[] = [
    ...answers.map((a) => ({
      kind: 'answer' as const,
      id: attemptEventId(a),
      at: a.answeredAt,
      correct: a.isCorrect,
      questionId: a.questionId,
    })),
    ...marks.map((b) => ({
      kind: 'bookmark' as const,
      id: b.clientId,
      at: b.at,
      bookmarked: b.bookmarked,
      questionId: b.questionId,
    })),
  ]
  const rows = [...foldAll(events)].map(([questionId, p]) => ({ questionId, ...p }))
  if (rows.length) {
    await tx
      .insert(questionProgress)
      .values(rows)
      .onConflictDoUpdate({
        target: questionProgress.questionId,
        set: {
          box: sql`excluded.box`,
          dueAt: sql`excluded.due_at`,
          seenCount: sql`excluded.seen_count`,
          correctCount: sql`excluded.correct_count`,
          wrongCount: sql`excluded.wrong_count`,
          streak: sql`excluded.streak`,
          lastCorrect: sql`excluded.last_correct`,
          lastAnsweredAt: sql`excluded.last_answered_at`,
          bookmarked: sql`excluded.bookmarked`,
          bookmarkedAt: sql`excluded.bookmarked_at`,
          updatedAt: sql`now()`,
        },
      })
  }
  return tx.select().from(questionProgress).where(inArray(questionProgress.questionId, questionIds))
}

/**
 * Store a device's offline work in one transaction (serialised across
 * devices). Every record is checked on its own: bad ones come back in
 * `rejected`, the rest are kept. Re-sending the same records is harmless.
 */
export async function applyPush(input: PushChanges, now = new Date()) {
  return withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${SYNC_LOCK})`)
    const rejected: SyncRejection[] = []
    const plausible = (d: Date) => d.getTime() >= EARLIEST.getTime() && d.getTime() <= now.getTime() + SKEW_MS

    const referenced = new Set<number>([
      ...input.attempts.map((a) => a.questionId),
      ...input.bookmarkEvents.map((b) => b.questionId),
      ...input.sessions.flatMap((s) => s.items.map((i) => i.questionId)),
    ])
    const known = referenced.size
      ? await tx
          .select({ id: questions.id, answerKey: questions.answerKey })
          .from(questions)
          .where(inArray(questions.id, [...referenced]))
      : []
    const answerKeys = new Map(known.map((q) => [q.id, q.answerKey]))

    // Sessions first: attempts may point at them.
    const sessionIds = new Set<string>()
    const incomingIds = input.sessions.map((s) => s.id)
    const stored = incomingIds.length
      ? await tx.select().from(studySessions).where(inArray(studySessions.id, incomingIds))
      : []
    const storedItems = incomingIds.length
      ? await tx.select().from(studySessionItems).where(inArray(studySessionItems.sessionId, incomingIds))
      : []
    const storedById = new Map(stored.map((s) => [s.id, s]))
    const storedItemsBySession = groupBy(storedItems, (i) => i.sessionId)

    for (const s of input.sessions) {
      const problem = sessionProblem(s, answerKeys, plausible)
      const existing = storedById.get(s.id)
      if (problem || (existing && existing.mode !== s.mode)) {
        rejected.push({ kind: 'session', id: s.id, reason: problem ?? 'mode differs from the stored session' })
        continue
      }
      const incoming = { ...s, items: s.items.map((i) => ({ ...i, isCorrect: gradeItem(s, i, answerKeys) })) }
      const base = existing
        ? {
            ...s,
            status: existing.status,
            completedAt: existing.completedAt,
            items: (storedItemsBySession.get(s.id) ?? []).map(
              (i): MergeItem => ({ ...i, selectedKey: i.selectedKey as ChoiceKey | null }),
            ),
          }
        : null
      const merged = mergeSession(base, incoming)
      const autoSubmitted = s.autoSubmitted || (existing?.autoSubmitted ?? false)
      await tx
        .insert(studySessions)
        .values({
          id: s.id,
          mode: s.mode,
          status: merged.status,
          filters: s.filters,
          orderMode: s.orderMode,
          questionCount: merged.items.length,
          startedAt: s.startedAt,
          durationSec: s.durationSec,
          expiresAt: s.expiresAt,
          completedAt: merged.completedAt,
          autoSubmitted,
          answeredCount: merged.answeredCount,
          correctCount: merged.correctCount,
        })
        .onConflictDoUpdate({
          target: studySessions.id,
          set: {
            status: merged.status,
            completedAt: merged.completedAt,
            autoSubmitted,
            answeredCount: merged.answeredCount,
            correctCount: merged.correctCount,
            updatedAt: sql`now()`,
          },
        })
      await tx
        .insert(studySessionItems)
        .values(
          merged.items.map((i) => ({
            sessionId: s.id,
            position: i.position,
            questionId: i.questionId,
            selectedKey: i.selectedKey,
            isCorrect: i.isCorrect,
            answeredAt: i.answeredAt,
            responseMs: i.responseMs,
            flagged: i.flagged,
          })),
        )
        .onConflictDoUpdate({
          target: [studySessionItems.sessionId, studySessionItems.position],
          set: {
            selectedKey: sql`excluded.selected_key`,
            isCorrect: sql`excluded.is_correct`,
            answeredAt: sql`excluded.answered_at`,
            responseMs: sql`excluded.response_ms`,
            flagged: sql`excluded.flagged`,
          },
        })
      sessionIds.add(s.id)
    }

    // Attempts: graded here, linked to a session only if that session exists.
    const askedSessions = [...new Set(input.attempts.flatMap((a) => (a.sessionId ? [a.sessionId] : [])))].filter(
      (id) => !sessionIds.has(id),
    )
    if (askedSessions.length) {
      const found = await tx
        .select({ id: studySessions.id })
        .from(studySessions)
        .where(inArray(studySessions.id, askedSessions))
      for (const f of found) sessionIds.add(f.id)
    }
    const touched = new Set<number>()
    const attemptRows: (typeof attempts.$inferInsert)[] = []
    for (const a of input.attempts) {
      if (!answerKeys.has(a.questionId)) {
        rejected.push({ kind: 'attempt', id: a.clientId, reason: 'unknown question' })
        continue
      }
      if (!plausible(a.answeredAt)) {
        rejected.push({ kind: 'attempt', id: a.clientId, reason: 'answer time out of range' })
        continue
      }
      attemptRows.push({
        clientId: a.clientId,
        questionId: a.questionId,
        sessionId: a.sessionId && sessionIds.has(a.sessionId) ? a.sessionId : null,
        mode: a.mode,
        selectedKey: a.selectedKey,
        isCorrect: isAnswerCorrect({
          mode: a.mode,
          selectedKey: a.selectedKey,
          answerKey: answerKeys.get(a.questionId) ?? null,
          selfGrade: a.selfGrade,
        }),
        responseMs: a.responseMs,
        answeredAt: a.answeredAt,
      })
      touched.add(a.questionId)
    }
    if (attemptRows.length) await tx.insert(attempts).values(attemptRows).onConflictDoNothing({ target: attempts.clientId })

    const bookmarkRows: (typeof bookmarkEvents.$inferInsert)[] = []
    for (const b of input.bookmarkEvents) {
      if (!answerKeys.has(b.questionId)) {
        rejected.push({ kind: 'bookmark', id: b.clientId, reason: 'unknown question' })
        continue
      }
      if (!plausible(b.at)) {
        rejected.push({ kind: 'bookmark', id: b.clientId, reason: 'time out of range' })
        continue
      }
      bookmarkRows.push({ clientId: b.clientId, questionId: b.questionId, bookmarked: b.bookmarked, at: b.at })
      touched.add(b.questionId)
    }
    if (bookmarkRows.length) {
      await tx.insert(bookmarkEvents).values(bookmarkRows).onConflictDoNothing({ target: bookmarkEvents.clientId })
    }

    const progress = await rebuildProgress(tx, [...touched])
    return {
      serverTime: now,
      accepted: { attempts: attemptRows.length, bookmarkEvents: bookmarkRows.length, sessions: input.sessions.length - rejected.filter((r) => r.kind === 'session').length },
      rejected,
      progress,
    }
  })
}
