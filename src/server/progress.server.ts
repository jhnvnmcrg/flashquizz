import { inArray, sql } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { questionProgress } from '#/db/schema'
import { applyAnswer, applyBookmark, type ProgressState } from '#/lib/leitner'

export async function loadProgress(questionIds: number[]) {
  const map = new Map<number, ProgressState>()
  if (!questionIds.length) return map
  const rows = await getDb()
    .select()
    .from(questionProgress)
    .where(inArray(questionProgress.questionId, questionIds))
  for (const r of rows) map.set(r.questionId, r)
  return map
}

/** One upsert statement for many progress rows (to include in a db.batch). */
export function upsertProgress(rows: (ProgressState & { questionId: number })[]) {
  return getDb()
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

export function nextProgress(prev: ProgressState | undefined, correct: boolean, now: Date) {
  return applyAnswer(prev ?? null, correct, now)
}

export function nextBookmark(prev: ProgressState | undefined, bookmarked: boolean, now: Date) {
  return applyBookmark(prev ?? null, bookmarked, now)
}
