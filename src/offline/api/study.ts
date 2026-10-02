import type { z } from 'zod'

import { randomSeed } from '#/lib/random'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { type StudyFilters, startSessionSchema } from '#/lib/schemas/study'
import { buildSession } from '#/lib/session-builder'
import { retryIdsFrom, selectCandidates } from '#/lib/study/candidates'
import { isAnswerCorrect } from '#/lib/study/grading'

import { type LocalSession, openLocalDb } from '../db'
import { applyLocalEvent, localStore } from '../store'
import { requestPush } from '../sync/engine'
import { ensureLocal, getLocalSession, loadViews, saveLocalSession } from './common'

/** Pick questions and save a new session on this device. */
export async function startSession({ data }: { data: z.input<typeof startSessionSchema> }) {
  const input = startSessionSchema.parse(data)
  const s = await ensureLocal()
  const filters: StudyFilters =
    input.mode === 'review' && !input.filters.fromSessionId ? { ...input.filters, scope: 'due' } : input.filters
  const from = filters.fromSessionId ? await getLocalSession(filters.fromSessionId) : null
  const now = new Date()
  const candidates = selectCandidates({
    index: s.index.values(),
    progress: s.progress,
    filters,
    now,
    retryIds: from ? retryIdsFrom(from.items) : undefined,
  })
  const ids = buildSession({
    candidates,
    count: input.count,
    order: input.mode === 'review' ? 'due' : input.order,
    seed: randomSeed(),
    now,
  })
  if (!ids.length) {
    throw new Error(input.mode === 'review' ? 'Nothing is due for review right now.' : 'No questions match these filters.')
  }
  const session: LocalSession = {
    id: crypto.randomUUID(),
    mode: input.mode,
    status: 'active',
    filters,
    orderMode: input.order,
    questionCount: ids.length,
    startedAt: now,
    durationSec: null,
    expiresAt: null,
    completedAt: null,
    autoSubmitted: false,
    answeredCount: 0,
    correctCount: 0,
    updatedAt: now,
    items: ids.map((questionId, position) => ({
      position,
      questionId,
      selectedKey: null,
      isCorrect: null,
      answeredAt: null,
      responseMs: null,
      flagged: false,
    })),
    pending: 1,
    rev: 0,
  }
  await saveLocalSession(session)
  return { id: session.id }
}

/** A session with full questions (answers included). */
export async function getSession({ data }: { data: { id: string } }) {
  await ensureLocal()
  const session = await getLocalSession(data.id)
  if (!session || session.mode === 'exam') throw new Error('Session not found')
  const views = await loadViews(session.items.map((i) => i.questionId))
  return {
    session: {
      id: session.id,
      mode: session.mode,
      status: session.status,
      questionCount: session.questionCount,
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      startedAt: session.startedAt,
      filters: session.filters,
    },
    items: session.items.flatMap((item) => {
      const question = views.get(item.questionId)
      return question
        ? [
            {
              position: item.position,
              selectedKey: item.selectedKey,
              isCorrect: item.isCorrect,
              answeredAt: item.answeredAt,
              question,
            },
          ]
        : []
    }),
  }
}

/** Grade and save one answer (or flashcard self-grade) on this device. */
export async function recordAnswer({
  data,
}: {
  data: {
    sessionId: string
    position: number
    selectedKey: ChoiceKey | null
    selfGrade?: 'again' | 'got_it' | null
    responseMs?: number | null
  }
}) {
  await ensureLocal()
  const db = await openLocalDb()
  const tx = db.transaction(['sessions', 'attempts', 'questions'], 'readwrite')
  const session = await tx.objectStore('sessions').get(data.sessionId)
  const item = session?.items.find((i) => i.position === data.position)
  if (!session || !item) throw new Error('Question not found in this session')
  if (session.mode === 'exam') throw new Error('Use the exam screen to answer exam questions')
  if (item.answeredAt) {
    // Already graded (e.g. a re-queued flashcard): progress counts once.
    await tx.done
    return { isCorrect: item.isCorrect ?? false, alreadyAnswered: true }
  }
  const question = await tx.objectStore('questions').get(item.questionId)
  const now = new Date()
  const isCorrect = isAnswerCorrect({
    mode: session.mode,
    selectedKey: data.selectedKey,
    answerKey: question?.answerKey ?? null,
    selfGrade: data.selfGrade,
  })
  item.selectedKey = data.selectedKey
  item.isCorrect = isCorrect
  item.answeredAt = now
  item.responseMs = data.responseMs ?? null
  session.answeredCount += 1
  session.correctCount += isCorrect ? 1 : 0
  if (session.answeredCount >= session.questionCount) {
    session.status = 'completed'
    session.completedAt = now
  }
  const clientId = crypto.randomUUID()
  void tx.objectStore('sessions').put({ ...session, updatedAt: now, pending: 1, rev: (session.rev ?? 0) + 1 })
  void tx.objectStore('attempts').put({
    id: clientId,
    clientId,
    questionId: item.questionId,
    sessionId: session.id,
    mode: session.mode,
    selectedKey: data.selectedKey,
    selfGrade: data.selfGrade ?? null,
    isCorrect,
    responseMs: data.responseMs ?? null,
    answeredAt: now,
    pending: 1,
  })
  await tx.done
  applyLocalEvent(item.questionId, { kind: 'answer', id: clientId, at: now, correct: isCorrect })
  requestPush()
  const progress = localStore.state.progress.get(item.questionId)
  return { isCorrect, alreadyAnswered: false, box: progress?.box ?? 0, dueAt: progress?.dueAt ?? null }
}

/** Bookmark or un-bookmark a question on this device. */
export async function toggleBookmark({ data }: { data: { questionId: number; bookmarked: boolean } }) {
  await ensureLocal()
  const now = new Date()
  const clientId = crypto.randomUUID()
  await (await openLocalDb()).put('bookmarkEvents', {
    clientId,
    questionId: data.questionId,
    bookmarked: data.bookmarked,
    at: now,
    pending: 1,
  })
  applyLocalEvent(data.questionId, { kind: 'bookmark', id: clientId, at: now, bookmarked: data.bookmarked })
  requestPush()
  return { bookmarked: data.bookmarked }
}

/** Leaving a session early. */
export async function completeSession({ data }: { data: { id: string } }) {
  const session = await getLocalSession(data.id)
  if (!session || session.mode === 'exam') throw new Error('Session not found')
  if (session.status === 'active') {
    await saveLocalSession({
      ...session,
      status: session.answeredCount > 0 ? 'completed' : 'abandoned',
      completedAt: new Date(),
    })
  }
  return { ok: true }
}

/** Results of a finished session (exams too). */
export async function getSessionSummary({ data }: { data: { id: string } }) {
  await ensureLocal()
  const session = await getLocalSession(data.id)
  if (!session) throw new Error('Session not found')
  const views = await loadViews(session.items.map((i) => i.questionId))
  const byTopic = new Map<string, { name: string; moduleCode: string; answered: number; correct: number }>()
  for (const item of session.items) {
    const q = views.get(item.questionId)
    if (item.isCorrect === null || !q) continue
    const key = q.topic ?? 'Unsorted'
    const t = byTopic.get(key) ?? { name: key, moduleCode: q.module.code, answered: 0, correct: 0 }
    t.answered++
    if (item.isCorrect) t.correct++
    byTopic.set(key, t)
  }
  return {
    session: {
      id: session.id,
      mode: session.mode,
      status: session.status,
      questionCount: session.questionCount,
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    topics: [...byTopic.values()].sort((a, b) => a.correct / a.answered - b.correct / b.answered),
    hues: [...new Set(session.items.flatMap((i) => views.get(i.questionId)?.module.accentHue ?? []))],
    missed: session.items.flatMap((i) => {
      const q = views.get(i.questionId)
      return i.isCorrect === false && q
        ? [{ position: i.position, stem: q.stem, moduleCode: q.module.code, accentHue: q.module.accentHue, topic: q.topic }]
        : []
    }),
  }
}
