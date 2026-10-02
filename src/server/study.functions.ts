import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/client.server'
import { attempts, bookmarkEvents, questions, studySessionItems, studySessions } from '#/db/schema'
import type { ChoiceKey } from '#/lib/schemas/enums'
import {
  recordAnswerSchema,
  sessionIdSchema,
  startSessionSchema,
  toggleBookmarkSchema,
} from '#/lib/schemas/study'
import { randomSeed } from '#/lib/random'
import { buildSession } from '#/lib/session-builder'

import { eligibleQuestion } from './eligibility.server'
import { ownerOnly } from './owner'
import { loadProgress, nextBookmark, nextProgress, upsertProgress } from './progress.server'
import { loadQuestionViews } from './question-payload.server'
import { selectCandidates } from './session-select.server'

export const startSession = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(startSessionSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const filters = data.mode === 'review' && !data.filters.fromSessionId
      ? { ...data.filters, scope: 'due' as const }
      : data.filters
    const candidates = await selectCandidates(filters)
    const ids = buildSession({
      candidates,
      count: data.count,
      order: data.mode === 'review' ? 'due' : data.order,
      seed: randomSeed(),
      now: new Date(),
    })
    if (!ids.length) {
      throw new Error(
        data.mode === 'review'
          ? 'Nothing is due for review right now.'
          : 'No questions match these filters.',
      )
    }
    const id = crypto.randomUUID()
    await db.batch([
      db.insert(studySessions).values({
        id,
        mode: data.mode,
        filters,
        orderMode: data.order,
        questionCount: ids.length,
      }),
      db.insert(studySessionItems).values(ids.map((questionId, position) => ({ sessionId: id, position, questionId }))),
    ])
    return { id }
  })

export const getSession = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.id) })
    if (!session || session.mode === 'exam') throw new Error('Session not found')
    const items = await db
      .select()
      .from(studySessionItems)
      .where(eq(studySessionItems.sessionId, data.id))
      .orderBy(asc(studySessionItems.position))
    const views = await loadQuestionViews(
      items.map((i) => i.questionId),
      true,
    )
    return {
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        questionCount: session.questionCount,
        answeredCount: session.answeredCount,
        correctCount: session.correctCount,
        startedAt: session.startedAt,
        filters: session.filters,
      },
      items: items.flatMap((item) => {
        const q = views.get(item.questionId)
        if (!q) return []
        return [
          {
            position: item.position,
            selectedKey: item.selectedKey as ChoiceKey | null,
            isCorrect: item.isCorrect,
            answeredAt: item.answeredAt,
            question: q as typeof q & { answerKey: ChoiceKey; rationale: string; mnemonic: string },
          },
        ]
      }),
    }
  })

export const recordAnswer = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(recordAnswerSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const now = new Date()
    const [row] = await db
      .select({
        mode: studySessions.mode,
        status: studySessions.status,
        questionCount: studySessions.questionCount,
        answeredCount: studySessions.answeredCount,
        questionId: studySessionItems.questionId,
        answeredAt: studySessionItems.answeredAt,
        isCorrect: studySessionItems.isCorrect,
        answerKey: questions.answerKey,
      })
      .from(studySessionItems)
      .innerJoin(studySessions, eq(studySessions.id, studySessionItems.sessionId))
      .innerJoin(questions, eq(questions.id, studySessionItems.questionId))
      .where(and(eq(studySessionItems.sessionId, data.sessionId), eq(studySessionItems.position, data.position)))
    if (!row) throw new Error('Question not found in this session')
    if (row.mode === 'exam') throw new Error('Use the exam screen to answer exam questions')
    if (row.answeredAt) {
      // Already graded (e.g. a re-queued flashcard) — progress counts once.
      return { isCorrect: row.isCorrect ?? false, alreadyAnswered: true }
    }

    const isCorrect =
      row.mode === 'flashcards' ? data.selfGrade === 'got_it' : data.selectedKey === row.answerKey
    const prev = (await loadProgress([row.questionId])).get(row.questionId)
    const progress = nextProgress(prev, isCorrect, now)
    const completes = row.answeredCount + 1 >= row.questionCount

    await db.batch([
      db
        .update(studySessionItems)
        .set({
          selectedKey: data.selectedKey,
          isCorrect,
          answeredAt: now,
          responseMs: data.responseMs ?? null,
        })
        .where(and(eq(studySessionItems.sessionId, data.sessionId), eq(studySessionItems.position, data.position))),
      db.insert(attempts).values({
        questionId: row.questionId,
        sessionId: data.sessionId,
        mode: row.mode,
        selectedKey: data.selectedKey,
        isCorrect,
        responseMs: data.responseMs ?? null,
        answeredAt: now,
      }),
      upsertProgress([{ questionId: row.questionId, ...progress }]),
      db
        .update(studySessions)
        .set({
          answeredCount: sql`${studySessions.answeredCount} + 1`,
          correctCount: sql`${studySessions.correctCount} + ${isCorrect ? 1 : 0}`,
          lastPosition: data.position,
          ...(completes ? { status: 'completed' as const, completedAt: now } : {}),
        })
        .where(eq(studySessions.id, data.sessionId)),
    ])
    return { isCorrect, alreadyAnswered: false, box: progress.box, dueAt: progress.dueAt }
  })

export const toggleBookmark = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(toggleBookmarkSchema)
  .handler(async ({ data }) => {
    const now = new Date()
    const prev = (await loadProgress([data.questionId])).get(data.questionId)
    const next = nextBookmark(prev, data.bookmarked, now)
    const db = getDb()
    // The event keeps progress rebuildable from history (see src/lib/study/progress-fold.ts).
    await db.batch([
      upsertProgress([{ questionId: data.questionId, ...next }]),
      db.insert(bookmarkEvents).values({ questionId: data.questionId, bookmarked: data.bookmarked, at: now }),
    ])
    return { bookmarked: next.bookmarked }
  })

export const completeSession = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.id) })
    if (!session || session.mode === 'exam') throw new Error('Session not found')
    if (session.status === 'active') {
      await db
        .update(studySessions)
        .set({ status: session.answeredCount > 0 ? 'completed' : 'abandoned', completedAt: new Date() })
        .where(eq(studySessions.id, data.id))
    }
    return { ok: true }
  })

export const getSessionSummary = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.id) })
    if (!session) throw new Error('Session not found')
    const items = await db.query.studySessionItems.findMany({
      where: eq(studySessionItems.sessionId, data.id),
      orderBy: asc(studySessionItems.position),
      with: {
        question: {
          columns: { id: true, stem: true, answerKey: true },
          with: {
            module: { columns: { slug: true, code: true, accentHue: true } },
            topic: { columns: { id: true, name: true } },
            progress: { columns: { box: true, dueAt: true, bookmarked: true } },
          },
        },
      },
    })
    const byTopic = new Map<string, { name: string; moduleCode: string; answered: number; correct: number }>()
    for (const item of items) {
      if (item.isCorrect === null) continue
      const key = item.question.topic?.name ?? 'Unsorted'
      const t = byTopic.get(key) ?? { name: key, moduleCode: item.question.module.code, answered: 0, correct: 0 }
      t.answered++
      if (item.isCorrect) t.correct++
      byTopic.set(key, t)
    }
    return {
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        questionCount: session.questionCount,
        answeredCount: session.answeredCount,
        correctCount: session.correctCount,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      },
      topics: [...byTopic.values()].sort((a, b) => a.correct / a.answered - b.correct / b.answered),
      hues: [...new Set(items.map((i) => i.question.module.accentHue))],
      missed: items
        .filter((i) => i.isCorrect === false)
        .map((i) => ({
          position: i.position,
          stem: i.question.stem,
          moduleCode: i.question.module.code,
          accentHue: i.question.module.accentHue,
          topic: i.question.topic?.name ?? null,
        })),
    }
  })

export const listActiveSessions = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async () => {
    const db = getDb()
    return db
      .select({
        id: studySessions.id,
        mode: studySessions.mode,
        questionCount: studySessions.questionCount,
        answeredCount: studySessions.answeredCount,
        correctCount: studySessions.correctCount,
        startedAt: studySessions.startedAt,
        filters: studySessions.filters,
      })
      .from(studySessions)
      .where(and(eq(studySessions.status, 'active'), ne(studySessions.mode, 'exam')))
      .orderBy(desc(studySessions.updatedAt))
      .limit(5)
  })

/** One question to answer straight from the dashboard. */
export const getWarmup = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(z.object({ skip: z.array(z.number().int()).max(50).default([]) }))
  .handler(async ({ data }) => {
    const candidates = (await selectCandidates({ moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all' })).filter(
      (c) => c.groupId === null && !data.skip.includes(c.id),
    )
    const [id] = buildSession({ candidates, count: 1, order: 'smart', seed: randomSeed(), now: new Date() })
    if (id === undefined) return null
    const view = (await loadQuestionViews([id], true)).get(id)
    return view ? (view as typeof view & { answerKey: ChoiceKey; rationale: string; mnemonic: string }) : null
  })

/** Answer a question outside any session (dashboard warm-up). */
export const answerLoose = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(z.object({ questionId: z.number().int().positive(), selectedKey: z.enum(['A', 'B', 'C', 'D', 'E']) }))
  .handler(async ({ data }) => {
    const db = getDb()
    const [q] = await db
      .select({ answerKey: questions.answerKey })
      .from(questions)
      .where(and(eq(questions.id, data.questionId), eligibleQuestion()))
    if (!q) throw new Error('Question not available')
    const now = new Date()
    const isCorrect = q.answerKey === data.selectedKey
    const prev = (await loadProgress([data.questionId])).get(data.questionId)
    const progress = nextProgress(prev, isCorrect, now)
    await db.batch([
      db.insert(attempts).values({
        questionId: data.questionId,
        mode: 'practice',
        selectedKey: data.selectedKey,
        isCorrect,
        answeredAt: now,
      }),
      upsertProgress([{ questionId: data.questionId, ...progress }]),
    ])
    return { isCorrect }
  })
