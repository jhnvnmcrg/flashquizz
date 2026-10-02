import { randomSeed } from '#/lib/random'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { buildSession } from '#/lib/session-builder'
import { selectCandidates } from '#/lib/study/candidates'
import { isAnswerCorrect } from '#/lib/study/grading'
import { boxCounts, studyStreak, todayTotals, topicTallies, upcomingDue } from '#/lib/study/stats'
import { emptyTally } from '#/lib/tally'

import { openLocalDb } from '../db'
import { applyLocalEvent } from '../store'
import { requestPush } from '../sync/engine'
import { byNewest, ensureLocal, loadViews } from './common'
import { finalizeExpiredExams } from './exam'

const ALL = { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all' as const }

/** Today: totals, streak, modules, sessions to resume, recent exams. Mirrors getDashboard. */
export async function getDashboard() {
  await finalizeExpiredExams()
  const s = await ensureLocal()
  const now = new Date()
  const db = await openLocalDb()
  const [attempts, sessions] = await Promise.all([db.getAll('attempts'), db.getAll('sessions')])
  const tallies = topicTallies(s.index.values(), s.progress, now)
  return {
    overall: tallies.overall,
    today: todayTotals(attempts, now),
    ...studyStreak(
      attempts.map((a) => a.answeredAt),
      now,
    ),
    needsReview: s.needsReview,
    modules: (s.taxonomy?.modules ?? []).map((m) => ({
      id: m.id,
      slug: m.slug,
      code: m.code,
      name: m.name,
      shortName: m.shortName,
      accentHue: m.accentHue,
      subjects: m.subjects.map((x) => x.name),
      tally: tallies.byModule.get(m.id) ?? emptyTally(),
    })),
    activeSessions: sessions
      .filter((x) => x.status === 'active')
      .sort(byNewest((x) => x.updatedAt))
      .slice(0, 4)
      .map((x) => ({
        id: x.id,
        mode: x.mode,
        questionCount: x.questionCount,
        answeredCount: x.answeredCount,
        correctCount: x.correctCount,
        startedAt: x.startedAt,
        expiresAt: x.expiresAt,
        filters: x.filters,
      })),
    recentExams: sessions
      .filter((x) => x.mode === 'exam' && x.status === 'completed')
      .sort(byNewest((x) => x.completedAt))
      .slice(0, 3)
      .map((x) => ({ id: x.id, questionCount: x.questionCount, correctCount: x.correctCount, completedAt: x.completedAt })),
  }
}

/** Review deck: due cards, the next two weeks, boxes, bookmarks. Mirrors getReviewHub. */
export async function getReviewHub() {
  const s = await ensureLocal()
  const now = new Date()
  const tallies = topicTallies(s.index.values(), s.progress, now)
  const progress = [...s.progress.values()]
  const marked = progress
    .filter((p) => p.bookmarked && s.index.has(p.questionId) && !s.index.get(p.questionId)?.archived)
    .sort(byNewest((p) => p.bookmarkedAt))
    .slice(0, 50)
  const views = await loadViews(marked.map((p) => p.questionId))
  return {
    overall: tallies.overall,
    modules: (s.taxonomy?.modules ?? []).map((m) => ({
      slug: m.slug,
      code: m.code,
      shortName: m.shortName,
      accentHue: m.accentHue,
      tally: tallies.byModule.get(m.id) ?? emptyTally(),
    })),
    upcoming: upcomingDue(progress, now),
    boxes: boxCounts(progress),
    bookmarks: marked.flatMap((p) => {
      const q = views.get(p.questionId)
      return q
        ? [
            {
              id: q.id,
              stem: q.stem,
              moduleCode: q.module.code,
              accentHue: q.module.accentHue,
              topic: q.topic,
              box: p.box,
              bookmarkedAt: p.bookmarkedAt,
            },
          ]
        : []
    }),
  }
}

/** One question to answer straight from the dashboard. Mirrors getWarmup. */
export async function getWarmup({ data }: { data: { skip: number[] } }) {
  const s = await ensureLocal()
  const skip = new Set(data.skip)
  const candidates = selectCandidates({ index: s.index.values(), progress: s.progress, filters: ALL, now: new Date() }).filter(
    (c) => c.groupId === null && !skip.has(c.id),
  )
  const [id] = buildSession({ candidates, count: 1, order: 'smart', seed: randomSeed(), now: new Date() })
  if (id === undefined) return null
  return (await loadViews([id])).get(id) ?? null
}

/** Answer a question outside any session (dashboard warm-up). Mirrors answerLoose. */
export async function answerLoose({ data }: { data: { questionId: number; selectedKey: ChoiceKey } }) {
  const s = await ensureLocal()
  if (!s.index.get(data.questionId)?.eligible) throw new Error('Question not available')
  const question = (await loadViews([data.questionId])).get(data.questionId)
  if (!question) throw new Error('Question not available')
  const now = new Date()
  const isCorrect = isAnswerCorrect({ mode: 'practice', selectedKey: data.selectedKey, answerKey: question.answerKey })
  const clientId = crypto.randomUUID()
  await (await openLocalDb()).put('attempts', {
    id: clientId,
    clientId,
    questionId: data.questionId,
    sessionId: null,
    mode: 'practice',
    selectedKey: data.selectedKey,
    selfGrade: null,
    isCorrect,
    responseMs: null,
    answeredAt: now,
    pending: 1,
  })
  applyLocalEvent(data.questionId, { kind: 'answer', id: clientId, at: now, correct: isCorrect })
  requestPush()
  return { isCorrect }
}
