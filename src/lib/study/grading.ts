import type { SessionMode } from '../schemas/enums.ts'

/**
 * Whether an answer is right. Flashcards are self-graded ("Got it"); every
 * other mode is checked against the answer key, so a client can't claim it.
 */
export function isAnswerCorrect({
  mode,
  selectedKey,
  answerKey,
  selfGrade,
}: {
  mode: SessionMode
  selectedKey: string | null
  answerKey: string | null
  selfGrade?: 'again' | 'got_it' | null
}) {
  if (mode === 'flashcards') return selfGrade === 'got_it'
  return selectedKey !== null && selectedKey === answerKey
}

/** Grade a submitted mock exam. A blank item counts as wrong. */
export function gradeExamItems<T extends { questionId: number; selectedKey: string | null }>(
  items: readonly T[],
  answerKeys: ReadonlyMap<number, string | null>,
) {
  const graded = items.map((i) => ({
    ...i,
    isCorrect: isAnswerCorrect({ mode: 'exam', selectedKey: i.selectedKey, answerKey: answerKeys.get(i.questionId) ?? null }),
  }))
  return {
    graded,
    answeredCount: graded.filter((g) => g.selectedKey !== null).length,
    correctCount: graded.filter((g) => g.isCorrect).length,
  }
}
