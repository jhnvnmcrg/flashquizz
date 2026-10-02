import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { questions } from '#/db/schema'

/**
 * Questions that may appear in study sessions and exams: imported or verified,
 * not a duplicate, has an answer key, and — if it needs an image — has one.
 */
export function eligibleQuestion() {
  return and(
    inArray(questions.status, ['auto', 'verified']),
    isNull(questions.duplicateOfRef),
    isNotNull(questions.answerKey),
    or(
      eq(questions.requiresImage, false),
      sql`exists (select 1 from question_images qi where qi.question_id = ${questions.id} and qi.role in ('stem', 'choice'))`,
    ),
  )
}
