import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { studySessionItems, studySessions } from '#/db/schema'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { saveExamAnswerSchema, sessionIdSchema, startExamSchema } from '#/lib/schemas/study'
import { randomSeed } from '#/lib/random'
import { buildExam } from '#/lib/session-builder'

import { EXAM_GRACE_SEC, finalizeExpiredExams, gradeExam } from './exam.server'
import { ownerOnly } from './owner'
import { loadQuestionViews } from './question-payload.server'
import { selectCandidates } from './session-select.server'

export const startExam = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(startExamSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const filters = { moduleSlugs: data.moduleSlugs, topicIds: [], sourceSlugs: [], scope: 'all' as const }
    const ids = buildExam({ candidates: await selectCandidates(filters), count: data.count, seed: randomSeed() })
    if (!ids.length) throw new Error('No questions are available for this exam.')
    const id = crypto.randomUUID()
    const startedAt = new Date()
    const durationSec = data.durationMin * 60
    await db.batch([
      db.insert(studySessions).values({
        id,
        mode: 'exam',
        filters,
        orderMode: 'random',
        questionCount: ids.length,
        startedAt,
        durationSec,
        expiresAt: new Date(startedAt.getTime() + durationSec * 1000),
      }),
      db.insert(studySessionItems).values(ids.map((questionId, position) => ({ sessionId: id, position, questionId }))),
    ])
    return { id }
  })

/** Exam paper without answers. Auto-submits if the timer already ran out. */
export const getExam = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    let session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.id) })
    if (!session || session.mode !== 'exam') throw new Error('Exam not found')
    if (
      session.status === 'active' &&
      session.expiresAt &&
      session.expiresAt.getTime() + EXAM_GRACE_SEC * 1000 < Date.now()
    ) {
      session = { ...session, ...(await gradeExam(session.id, true)) }
    }
    const items = await db
      .select()
      .from(studySessionItems)
      .where(eq(studySessionItems.sessionId, data.id))
      .orderBy(asc(studySessionItems.position))
    const views = await loadQuestionViews(
      items.map((i) => i.questionId),
      false,
    )
    return {
      serverNow: new Date(),
      session: {
        id: session.id,
        status: session.status,
        questionCount: session.questionCount,
        startedAt: session.startedAt,
        // Exams always have both (check constraint study_sessions_exam_timer_check).
        expiresAt: session.expiresAt ?? session.startedAt,
        durationSec: session.durationSec ?? 0,
        filters: session.filters,
      },
      items: items.flatMap((item) => {
        const question = views.get(item.questionId)
        return question
          ? [
              {
                position: item.position,
                selectedKey: item.selectedKey as ChoiceKey | null,
                flagged: item.flagged,
                question,
              },
            ]
          : []
      }),
    }
  })

export const saveExamAnswer = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(saveExamAnswerSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.sessionId) })
    if (!session || session.mode !== 'exam') throw new Error('Exam not found')
    if (session.status !== 'active') throw new Error('This exam has already been submitted.')
    if (session.expiresAt && session.expiresAt.getTime() + EXAM_GRACE_SEC * 1000 < Date.now()) {
      throw new Error('Time is up — this answer was not saved.')
    }
    await db
      .update(studySessionItems)
      .set({
        selectedKey: data.selectedKey,
        answeredAt: data.selectedKey ? new Date() : null,
        ...(data.flagged === undefined ? {} : { flagged: data.flagged }),
      })
      .where(and(eq(studySessionItems.sessionId, data.sessionId), eq(studySessionItems.position, data.position)))
    return { ok: true }
  })

export const submitExam = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const graded = await gradeExam(data.id, false)
    return { id: graded.id, status: graded.status }
  })

export const getExamResult = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(sessionIdSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, data.id) })
    if (!session || session.mode !== 'exam') throw new Error('Exam not found')
    if (session.status === 'active') return { status: 'active' as const, id: session.id }
    const items = await db
      .select()
      .from(studySessionItems)
      .where(eq(studySessionItems.sessionId, data.id))
      .orderBy(asc(studySessionItems.position))
    const views = await loadQuestionViews(
      items.map((i) => i.questionId),
      true,
    )
    const rows = items.flatMap((item) => {
      const q = views.get(item.questionId)
      return q
        ? [
            {
              position: item.position,
              selectedKey: item.selectedKey as ChoiceKey | null,
              isCorrect: item.isCorrect ?? false,
              flagged: item.flagged,
              question: q as typeof q & { answerKey: ChoiceKey; rationale: string; mnemonic: string },
            },
          ]
        : []
    })
    const breakdown = new Map<
      string,
      { key: string; moduleCode: string; accentHue: number; topic: string; total: number; correct: number }
    >()
    for (const r of rows) {
      const key = `${r.question.module.code}:${r.question.topic ?? 'Unsorted'}`
      const b = breakdown.get(key) ?? {
        key,
        moduleCode: r.question.module.code,
        accentHue: r.question.module.accentHue,
        topic: r.question.topic ?? 'Unsorted',
        total: 0,
        correct: 0,
      }
      b.total++
      if (r.isCorrect) b.correct++
      breakdown.set(key, b)
    }
    return {
      status: 'completed' as const,
      id: session.id,
      session: {
        questionCount: session.questionCount,
        answeredCount: session.answeredCount,
        correctCount: session.correctCount,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        durationSec: session.durationSec,
        autoSubmitted: session.autoSubmitted,
      },
      topics: [...breakdown.values()],
      items: rows,
    }
  })

export const listExams = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async () => {
    await finalizeExpiredExams()
    return getDb()
      .select({
        id: studySessions.id,
        status: studySessions.status,
        questionCount: studySessions.questionCount,
        answeredCount: studySessions.answeredCount,
        correctCount: studySessions.correctCount,
        startedAt: studySessions.startedAt,
        completedAt: studySessions.completedAt,
        expiresAt: studySessions.expiresAt,
        durationSec: studySessions.durationSec,
        autoSubmitted: studySessions.autoSubmitted,
        filters: studySessions.filters,
      })
      .from(studySessions)
      .where(eq(studySessions.mode, 'exam'))
      .orderBy(desc(studySessions.startedAt))
      .limit(20)
  })
