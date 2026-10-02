/** Study counts for a set of questions (a topic, a module, or everything). */
export type Tally = {
  total: number
  seen: number
  /** Number of answers given, not distinct questions. */
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
