import type { StudyOrder } from './schemas/enums.ts'
import { mulberry32, shuffle } from './random.ts'

export type CandidateProgress = {
  box: number
  dueAt: Date | null
  seenCount: number
  lastCorrect: boolean | null
  lastAnsweredAt: Date | null
}

export type Candidate = {
  id: number
  moduleSlug: string
  groupId: number | null
  groupOrder: number | null
  /** Sequential order: source, module, ordinal. */
  sortKey: [number, number, number]
  progress: CandidateProgress | null
}

type Unit = { members: Candidate[]; key: string }

/** Questions sharing a group always travel together, in group order. */
export function toUnits(candidates: Candidate[]): Unit[] {
  const groups = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = c.groupId === null ? `q${c.id}` : `g${c.groupId}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return [...groups.entries()].map(([key, members]) => ({
    key,
    members: members.sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0) || a.id - b.id),
  }))
}

function compareSortKey(a: Candidate, b: Candidate) {
  return a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2]
}

/** 0 = due, 1 = unseen, 2 = last answer wrong, 3 = everything else. */
export function tierOf(c: Candidate, now: Date) {
  const p = c.progress
  if (p && p.box > 0 && p.dueAt && p.dueAt.getTime() <= now.getTime()) return 0
  if (!p || p.seenCount === 0) return 1
  if (p.lastCorrect === false) return 2
  return 3
}

function take(units: Unit[], count: number) {
  const out: number[] = []
  for (const u of units) {
    if (out.length >= count) break
    for (const m of u.members) out.push(m.id)
  }
  return out
}

export type BuildOptions = {
  candidates: Candidate[]
  count: number
  order: StudyOrder | 'due'
  seed: number
  now: Date
}

/** Ordered question ids for a study session. Groups are never split. */
export function buildSession({ candidates, count, order, seed, now }: BuildOptions): number[] {
  const rand = mulberry32(seed)
  const units = toUnits(candidates)

  if (order === 'sequential') {
    units.sort((a, b) => compareSortKey(a.members[0], b.members[0]))
    return take(units, count)
  }
  if (order === 'random') return take(shuffle(units, rand), count)
  if (order === 'due') {
    const dueTime = (u: Unit) =>
      Math.min(...u.members.map((m) => m.progress?.dueAt?.getTime() ?? Number.POSITIVE_INFINITY))
    return take(
      shuffle(units, rand).sort((a, b) => dueTime(a) - dueTime(b)),
      count,
    )
  }

  // smart: due → unseen → last wrong → the rest (least recently answered first)
  const tiers: Unit[][] = [[], [], [], []]
  for (const u of units) tiers[Math.min(...u.members.map((m) => tierOf(m, now)))].push(u)
  const lastSeen = (u: Unit) => Math.min(...u.members.map((m) => m.progress?.lastAnsweredAt?.getTime() ?? 0))
  const ordered = [
    ...shuffle(tiers[0], rand),
    ...shuffle(tiers[1], rand),
    ...shuffle(tiers[2], rand),
    ...shuffle(tiers[3], rand).sort((a, b) => lastSeen(a) - lastSeen(b)),
  ]
  return take(ordered, count)
}

/** Largest-remainder apportionment of `total` across buckets by size. */
export function apportion(sizes: Record<string, number>, total: number) {
  const keys = Object.keys(sizes).filter((k) => sizes[k] > 0)
  const sum = keys.reduce((s, k) => s + sizes[k], 0)
  const target = Math.min(total, sum)
  const quotas: Record<string, number> = {}
  if (!sum) return quotas
  const remainders: [string, number][] = []
  let assigned = 0
  for (const k of keys) {
    const exact = (sizes[k] / sum) * target
    quotas[k] = Math.min(Math.floor(exact), sizes[k])
    assigned += quotas[k]
    remainders.push([k, exact - Math.floor(exact)])
  }
  remainders.sort((a, b) => b[1] - a[1])
  for (const [k] of remainders) {
    if (assigned >= target) break
    if (quotas[k] < sizes[k]) {
      quotas[k]++
      assigned++
    }
  }
  return quotas
}

/** Mock exam: proportional per-module draw, then shuffled (groups intact). */
export function buildExam({
  candidates,
  count,
  seed,
}: Pick<BuildOptions, 'candidates' | 'count' | 'seed'>): number[] {
  const rand = mulberry32(seed)
  const byModule = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const list = byModule.get(c.moduleSlug) ?? []
    list.push(c)
    byModule.set(c.moduleSlug, list)
  }
  const sizes = Object.fromEntries([...byModule].map(([k, v]) => [k, v.length]))
  const quotas = apportion(sizes, count)
  const picked: Unit[] = []
  for (const [mod, list] of byModule) {
    const quota = quotas[mod] ?? 0
    let n = 0
    for (const u of shuffle(toUnits(list), rand)) {
      if (n >= quota) break
      picked.push(u)
      n += u.members.length
    }
  }
  return shuffle(picked, rand).flatMap((u) => u.members.map((m) => m.id))
}
