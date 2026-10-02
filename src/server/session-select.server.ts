import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { modules, questionProgress, questions, sources, studySessionItems } from '#/db/schema'
import type { StudyFilters } from '#/lib/schemas/study'
import type { Candidate } from '#/lib/session-builder'

import { eligibleQuestion } from './eligibility.server'

/**
 * Eligible questions matching the filters/scope, shaped for the session
 * builder, in SQL. The app now selects on the device
 * (src/lib/study/candidates.ts); this stays as the reference that
 * scripts/check-offline-parity.ts compares against.
 */
export async function selectCandidates(filters: StudyFilters): Promise<Candidate[]> {
  const db = getDb()
  const where: (SQL | undefined)[] = [eligibleQuestion()]

  if (filters.moduleSlugs.length) where.push(inArray(modules.slug, filters.moduleSlugs))
  if (filters.topicIds.length) where.push(inArray(questions.topicId, filters.topicIds))
  if (filters.sourceSlugs.length) where.push(inArray(sources.slug, filters.sourceSlugs))

  if (filters.fromSessionId) {
    where.push(
      inArray(
        questions.id,
        db
          .select({ id: studySessionItems.questionId })
          .from(studySessionItems)
          .where(
            and(
              eq(studySessionItems.sessionId, filters.fromSessionId),
              or(eq(studySessionItems.isCorrect, false), isNull(studySessionItems.isCorrect)),
            ),
          ),
      ),
    )
  } else {
    switch (filters.scope) {
      case 'unseen':
        where.push(or(isNull(questionProgress.questionId), eq(questionProgress.seenCount, 0)))
        break
      case 'mistakes':
        where.push(eq(questionProgress.lastCorrect, false))
        break
      case 'bookmarked':
        where.push(eq(questionProgress.bookmarked, true))
        break
      case 'due':
        where.push(sql`${questionProgress.box} > 0 and ${questionProgress.dueAt} <= now()`)
        break
    }
  }

  const rows = await db
    .select({
      id: questions.id,
      moduleSlug: modules.slug,
      moduleSort: modules.sortOrder,
      sourceSort: sources.sortOrder,
      ordinal: questions.ordinal,
      groupId: questions.groupId,
      groupOrder: questions.groupOrder,
      box: questionProgress.box,
      dueAt: questionProgress.dueAt,
      seenCount: questionProgress.seenCount,
      lastCorrect: questionProgress.lastCorrect,
      lastAnsweredAt: questionProgress.lastAnsweredAt,
    })
    .from(questions)
    .innerJoin(modules, eq(modules.id, questions.moduleId))
    .innerJoin(sources, eq(sources.id, questions.sourceId))
    .leftJoin(questionProgress, eq(questionProgress.questionId, questions.id))
    .where(and(...where))

  return rows.map((r) => ({
    id: r.id,
    moduleSlug: r.moduleSlug,
    groupId: r.groupId,
    groupOrder: r.groupOrder,
    sortKey: [r.sourceSort, r.moduleSort, r.ordinal],
    progress:
      r.box === null
        ? null
        : {
            box: r.box,
            dueAt: r.dueAt,
            seenCount: r.seenCount ?? 0,
            lastCorrect: r.lastCorrect,
            lastAnsweredAt: r.lastAnsweredAt,
          },
  }))
}
