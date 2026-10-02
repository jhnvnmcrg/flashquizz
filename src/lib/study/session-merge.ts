import type { ChoiceKey, SessionStatus } from '../schemas/enums.ts'

export type MergeItem = {
  position: number
  questionId: number
  selectedKey: ChoiceKey | null
  isCorrect: boolean | null
  answeredAt: Date | null
  responseMs: number | null
  flagged: boolean
}

export type MergeSession = {
  status: SessionStatus
  completedAt: Date | null
  items: MergeItem[]
}

// A session only moves forward: active → abandoned → completed.
const RANK: Record<SessionStatus, number> = { active: 0, abandoned: 1, completed: 2 }

/** Earliest answer wins; an answered item is never un-answered. */
function mergeItem(base: MergeItem, incoming: MergeItem): MergeItem {
  const flagged = base.flagged || incoming.flagged
  if (!incoming.answeredAt) return { ...base, flagged }
  if (base.answeredAt && base.answeredAt.getTime() <= incoming.answeredAt.getTime()) return { ...base, flagged }
  return { ...incoming, flagged }
}

/**
 * Combine what two devices know about the same study session. Items are
 * matched by position (an incoming item for a different question is ignored);
 * counts are recomputed from the merged items.
 */
export function mergeSession<S extends MergeSession>(base: S | null, incoming: S) {
  const target = base ?? incoming
  const byPosition = new Map(target.items.map((i) => [i.position, i]))
  if (base) {
    for (const item of incoming.items) {
      const existing = byPosition.get(item.position)
      if (!existing) byPosition.set(item.position, item)
      else if (existing.questionId === item.questionId) byPosition.set(item.position, mergeItem(existing, item))
    }
  }
  const items = [...byPosition.values()].sort((a, b) => a.position - b.position)
  const answeredCount = items.filter((i) => i.answeredAt).length
  const correctCount = items.filter((i) => i.isCorrect === true).length

  let status = base && RANK[base.status] > RANK[incoming.status] ? base.status : incoming.status
  if (status === 'abandoned' && answeredCount > 0) status = 'completed'

  const completedAt =
    status === 'active'
      ? null
      : (earliest(base?.completedAt ?? null, incoming.completedAt) ?? latestAnswer(items) ?? new Date())

  return { ...target, status, completedAt, items, answeredCount, correctCount }
}

function earliest(a: Date | null, b: Date | null) {
  if (!a) return b
  if (!b) return a
  return a.getTime() <= b.getTime() ? a : b
}

function latestAnswer(items: MergeItem[]) {
  let latest: Date | null = null
  for (const i of items) if (i.answeredAt && (!latest || i.answeredAt > latest)) latest = i.answeredAt
  return latest
}
