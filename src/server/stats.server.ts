import { eq, sql } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { questionProgress, questions } from '#/db/schema'

import { eligibleQuestion } from './eligibility.server'

export type Tally = {
  total: number
  seen: number
  answered: number
  correct: number
  due: number
  bookmarked: number
  missed: number
}

export const emptyTally = (): Tally => ({
  total: 0,
  seen: 0,
  answered: 0,
  correct: 0,
  due: 0,
  bookmarked: 0,
  missed: 0,
})

export function addTally(into: Tally, from: Tally) {
  for (const k of Object.keys(into) as (keyof Tally)[]) into[k] += from[k]
  return into
}

/** Eligible-question tallies grouped by module and topic. */
export async function topicTallies() {
  const db = getDb()
  const rows = await db
    .select({
      moduleId: questions.moduleId,
      topicId: questions.topicId,
      total: sql<number>`count(*)::int`,
      seen: sql<number>`count(*) filter (where ${questionProgress.seenCount} > 0)::int`,
      answered: sql<number>`coalesce(sum(${questionProgress.seenCount}), 0)::int`,
      correct: sql<number>`coalesce(sum(${questionProgress.correctCount}), 0)::int`,
      due: sql<number>`count(*) filter (where ${questionProgress.box} > 0 and ${questionProgress.dueAt} <= now())::int`,
      bookmarked: sql<number>`count(*) filter (where ${questionProgress.bookmarked})::int`,
      missed: sql<number>`count(*) filter (where ${questionProgress.lastCorrect} = false)::int`,
    })
    .from(questions)
    .leftJoin(questionProgress, eq(questionProgress.questionId, questions.id))
    .where(eligibleQuestion())
    .groupBy(questions.moduleId, questions.topicId)

  const bucket = (map: Map<number, Tally>, key: number) => {
    let t = map.get(key)
    if (!t) {
      t = emptyTally()
      map.set(key, t)
    }
    return t
  }
  const byModule = new Map<number, Tally>()
  const byTopic = new Map<number, Tally>()
  const overall = emptyTally()
  for (const r of rows) {
    const t: Tally = {
      total: r.total,
      seen: r.seen,
      answered: r.answered,
      correct: r.correct,
      due: r.due,
      bookmarked: r.bookmarked,
      missed: r.missed,
    }
    addTally(bucket(byModule, r.moduleId), t)
    if (r.topicId !== null) addTally(bucket(byTopic, r.topicId), t)
    addTally(overall, t)
  }
  return { byModule, byTopic, overall }
}
