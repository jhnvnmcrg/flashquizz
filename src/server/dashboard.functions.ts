import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { attempts, modules, questionProgress, questions, studySessions, subjects, topics } from '#/db/schema'

import { STUDY_TIMEZONE } from '#/lib/constants'
import { emptyTally } from '#/lib/tally'

import { finalizeExpiredExams } from './exam.server'
import { ownerOnly } from './owner'
import { topicTallies } from './stats.server'

/** Consecutive study days ending today (or yesterday) in Manila time. */
async function studyStreak() {
  const rows = await getDb()
    .select({ day: sql<string>`to_char(date(${attempts.answeredAt} at time zone ${STUDY_TIMEZONE}), 'YYYY-MM-DD')` })
    .from(attempts)
    .where(sql`${attempts.answeredAt} > now() - interval '120 days'`)
    .groupBy(sql`1`)
    .orderBy(desc(sql`1`))
  const days = new Set(rows.map((r) => r.day))
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: STUDY_TIMEZONE }))
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const cursor = new Date(today)
  if (!days.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(fmt(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return { streak, studiedToday: days.has(fmt(today)) }
}

export const getDashboard = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async () => {
    const db = getDb()
    await finalizeExpiredExams()
    const [tallies, mods, today, streak, active, exams, review] = await Promise.all([
      topicTallies(),
      db.query.modules.findMany({
        orderBy: asc(modules.sortOrder),
        with: { subjects: { orderBy: asc(subjects.sortOrder), columns: { id: true, name: true } } },
      }),
      db
        .select({
          answered: sql<number>`count(*)::int`,
          correct: sql<number>`count(*) filter (where ${attempts.isCorrect})::int`,
        })
        .from(attempts)
        .where(
          sql`date(${attempts.answeredAt} at time zone ${STUDY_TIMEZONE}) = date(now() at time zone ${STUDY_TIMEZONE})`,
        ),
      studyStreak(),
      db
        .select({
          id: studySessions.id,
          mode: studySessions.mode,
          questionCount: studySessions.questionCount,
          answeredCount: studySessions.answeredCount,
          correctCount: studySessions.correctCount,
          startedAt: studySessions.startedAt,
          expiresAt: studySessions.expiresAt,
          filters: studySessions.filters,
        })
        .from(studySessions)
        .where(eq(studySessions.status, 'active'))
        .orderBy(desc(studySessions.updatedAt))
        .limit(4),
      db
        .select({
          id: studySessions.id,
          questionCount: studySessions.questionCount,
          correctCount: studySessions.correctCount,
          completedAt: studySessions.completedAt,
        })
        .from(studySessions)
        .where(and(eq(studySessions.mode, 'exam'), eq(studySessions.status, 'completed')))
        .orderBy(desc(studySessions.completedAt))
        .limit(3),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(questions)
        .where(eq(questions.status, 'needs_review')),
    ])
    return {
      overall: tallies.overall,
      today: today[0] ?? { answered: 0, correct: 0 },
      ...streak,
      needsReview: review[0]?.n ?? 0,
      modules: mods.map((m) => ({
        id: m.id,
        slug: m.slug,
        code: m.code,
        name: m.name,
        shortName: m.shortName,
        accentHue: m.accentHue,
        subjects: m.subjects.map((s) => s.name),
        tally: tallies.byModule.get(m.id) ?? emptyTally(),
      })),
      activeSessions: active,
      recentExams: exams,
    }
  })

export const getReviewHub = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(async () => {
    const db = getDb()
    const [tallies, mods, upcoming, bookmarks] = await Promise.all([
      topicTallies(),
      db.query.modules.findMany({ orderBy: asc(modules.sortOrder) }),
      db
        .select({
          day: sql<string>`to_char(date(${questionProgress.dueAt} at time zone ${STUDY_TIMEZONE}), 'YYYY-MM-DD')`,
          n: sql<number>`count(*)::int`,
        })
        .from(questionProgress)
        .where(and(sql`${questionProgress.box} > 0`, sql`${questionProgress.dueAt} > now()`, sql`${questionProgress.dueAt} < now() + interval '14 days'`))
        .groupBy(sql`1`)
        .orderBy(asc(sql`1`)),
      db
        .select({
          id: questions.id,
          stem: questions.stem,
          moduleCode: modules.code,
          accentHue: modules.accentHue,
          topic: topics.name,
          box: questionProgress.box,
          bookmarkedAt: questionProgress.bookmarkedAt,
        })
        .from(questionProgress)
        .innerJoin(questions, eq(questions.id, questionProgress.questionId))
        .innerJoin(modules, eq(modules.id, questions.moduleId))
        .leftJoin(topics, eq(topics.id, questions.topicId))
        .where(and(eq(questionProgress.bookmarked, true), ne(questions.status, 'archived')))
        .orderBy(desc(questionProgress.bookmarkedAt))
        .limit(50),
    ])
    const boxes = await db
      .select({ box: questionProgress.box, n: sql<number>`count(*)::int` })
      .from(questionProgress)
      .where(sql`${questionProgress.box} > 0`)
      .groupBy(questionProgress.box)
      .orderBy(asc(questionProgress.box))
    return {
      overall: tallies.overall,
      modules: mods.map((m) => ({
        slug: m.slug,
        code: m.code,
        shortName: m.shortName,
        accentHue: m.accentHue,
        tally: tallies.byModule.get(m.id) ?? emptyTally(),
      })),
      upcoming,
      boxes,
      bookmarks,
    }
  })
