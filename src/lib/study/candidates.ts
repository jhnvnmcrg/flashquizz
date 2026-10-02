import { isDue, type ProgressState } from '../leitner.ts'
import type { StudyFilters } from '../schemas/study.ts'
import type { Candidate } from '../session-builder.ts'

/** The small per-question record a device keeps in memory for every question it holds. */
export type IndexedQuestion = {
  id: number
  moduleId: number
  moduleSlug: string
  topicId: number | null
  sourceSlug: string
  groupId: number | null
  groupOrder: number | null
  /** Sequential order: source, module, ordinal. */
  sortKey: [number, number, number]
  /** May appear in sessions and exams (decided by the server's `eligibleQuestion`). */
  eligible: boolean
}

export type ProgressMap = ReadonlyMap<number, ProgressState>

function inScope(scope: StudyFilters['scope'], p: ProgressState | null, now: Date) {
  switch (scope) {
    case 'unseen':
      return !p || p.seenCount === 0
    case 'mistakes':
      return p?.lastCorrect === false
    case 'bookmarked':
      return p?.bookmarked === true
    case 'due':
      return isDue(p, now)
    default:
      return true
  }
}

/**
 * Eligible questions matching the filters/scope, shaped for the session builder.
 * Mirrors `selectCandidates` in `src/server/session-select.server.ts`; with
 * `fromSessionId`, `retryIds` (see `retryIdsFrom`) replaces the scope.
 */
export function selectCandidates({
  index,
  progress,
  filters,
  now,
  retryIds,
}: {
  index: Iterable<IndexedQuestion>
  progress: ProgressMap
  filters: StudyFilters
  now: Date
  retryIds?: ReadonlySet<number>
}): Candidate[] {
  const modules = new Set(filters.moduleSlugs)
  const topics = new Set(filters.topicIds)
  const sources = new Set(filters.sourceSlugs)
  const out: Candidate[] = []
  for (const q of index) {
    if (!q.eligible) continue
    if (modules.size && !modules.has(q.moduleSlug)) continue
    if (topics.size && (q.topicId === null || !topics.has(q.topicId))) continue
    if (sources.size && !sources.has(q.sourceSlug)) continue
    const p = progress.get(q.id) ?? null
    if (filters.fromSessionId ? !retryIds?.has(q.id) : !inScope(filters.scope, p, now)) continue
    out.push({
      id: q.id,
      moduleSlug: q.moduleSlug,
      groupId: q.groupId,
      groupOrder: q.groupOrder,
      sortKey: q.sortKey,
      progress: p && {
        box: p.box,
        dueAt: p.dueAt,
        seenCount: p.seenCount,
        lastCorrect: p.lastCorrect,
        lastAnsweredAt: p.lastAnsweredAt,
      },
    })
  }
  return out
}

/** Questions from a finished session worth retrying: missed or never answered. */
export function retryIdsFrom(items: Iterable<{ questionId: number; isCorrect: boolean | null }>) {
  const ids = new Set<number>()
  for (const i of items) if (i.isCorrect !== true) ids.add(i.questionId)
  return ids
}
