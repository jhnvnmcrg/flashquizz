import { and, eq, lt, sql } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { attempts, questions, studySessionItems, studySessions } from '#/db/schema'

import { loadProgress, nextProgress, upsertProgress } from './progress.server'

/** Seconds of grace after expiry for in-flight answer saves. */
export const EXAM_GRACE_SEC = 15

/**
 * Grade an active exam in one batch: item results, attempts, Leitner progress
 * (unanswered counts as wrong) and the session totals. Safe to call twice.
 */
export async function gradeExam(sessionId: string, auto: boolean) {
  const db = getDb()
  const session = await db.query.studySessions.findFirst({ where: eq(studySessions.id, sessionId) })
  if (!session || session.mode !== 'exam') throw new Error('Exam not found')
  if (session.status !== 'active') return session

  const items = await db
    .select({
      position: studySessionItems.position,
      questionId: studySessionItems.questionId,
      selectedKey: studySessionItems.selectedKey,
      answerKey: questions.answerKey,
    })
    .from(studySessionItems)
    .innerJoin(questions, eq(questions.id, studySessionItems.questionId))
    .where(eq(studySessionItems.sessionId, sessionId))

  const now = new Date()
  const graded = items.map((i) => ({ ...i, isCorrect: i.selectedKey !== null && i.selectedKey === i.answerKey }))
  const prev = await loadProgress(graded.map((g) => g.questionId))
  const progress = graded.map((g) => ({
    questionId: g.questionId,
    ...nextProgress(prev.get(g.questionId), g.isCorrect, now),
  }))
  const correctCount = graded.filter((g) => g.isCorrect).length
  const answeredCount = graded.filter((g) => g.selectedKey !== null).length

  const correctPositions = graded.filter((g) => g.isCorrect).map((g) => g.position)
  await db.batch([
    db
      .update(studySessionItems)
      .set({
        isCorrect: correctPositions.length
          ? sql`${studySessionItems.position} in (${sql.join(
              correctPositions.map((p) => sql`${p}`),
              sql`, `,
            )})`
          : false,
      })
      .where(eq(studySessionItems.sessionId, sessionId)),
    db.insert(attempts).values(
      graded.map((g) => ({
        questionId: g.questionId,
        sessionId,
        mode: 'exam' as const,
        selectedKey: g.selectedKey,
        isCorrect: g.isCorrect,
        answeredAt: now,
      })),
    ),
    upsertProgress(progress),
    db
      .update(studySessions)
      .set({
        status: 'completed',
        completedAt: now,
        autoSubmitted: auto,
        answeredCount,
        correctCount,
      })
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.status, 'active'))),
  ])
  return { ...session, status: 'completed' as const, completedAt: now, answeredCount, correctCount }
}

/** Auto-submit every active exam whose timer ran out. */
export async function finalizeExpiredExams() {
  const db = getDb()
  const expired = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.mode, 'exam'),
        eq(studySessions.status, 'active'),
        lt(studySessions.expiresAt, sql`now() - make_interval(secs => ${EXAM_GRACE_SEC})`),
      ),
    )
  for (const e of expired) await gradeExam(e.id, true)
  return expired.length
}
