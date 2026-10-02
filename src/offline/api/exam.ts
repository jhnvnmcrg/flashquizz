import type { z } from 'zod'

import { EXAM_GRACE_SEC } from '#/lib/constants'
import { randomSeed } from '#/lib/random'
import type { ChoiceKey } from '#/lib/schemas/enums'
import { startExamSchema } from '#/lib/schemas/study'
import { buildExam } from '#/lib/session-builder'
import { selectCandidates } from '#/lib/study/candidates'
import { gradeExamItems } from '#/lib/study/grading'

import { type LocalSession, openLocalDb } from '../db'
import { applyLocalEvent } from '../store'
import { requestPush } from '../sync/engine'
import { byNewest, ensureLocal, getLocalSession, loadViews, withoutAnswers } from './common'

/**
 * Mock exams live only on the device that started them until they're graded;
 * then the graded exam and one answer per item upload together. The timer
 * runs on this device's clock.
 */

const expired = (s: LocalSession, now = Date.now()) =>
  s.status === 'active' && !!s.expiresAt && s.expiresAt.getTime() + EXAM_GRACE_SEC * 1000 < now

async function getExamSession(id: string) {
  const session = await getLocalSession(id)
  if (!session || session.mode !== 'exam') throw new Error('Exam not found')
  return session
}

/** Grade a mock exam on this device (blank = wrong) and queue it for upload. Safe to call twice. */
async function gradeExam(sessionId: string, auto: boolean) {
  const db = await openLocalDb()
  const tx = db.transaction(['sessions', 'attempts', 'questions'], 'readwrite')
  const session = await tx.objectStore('sessions').get(sessionId)
  if (!session || session.mode !== 'exam') throw new Error('Exam not found')
  if (session.status !== 'active') {
    await tx.done
    return session
  }
  const keys = new Map<number, string | null>()
  for (const item of session.items) keys.set(item.questionId, (await tx.objectStore('questions').get(item.questionId))?.answerKey ?? null)
  const { graded, answeredCount, correctCount } = gradeExamItems(session.items, keys)
  const now = new Date()
  const done: LocalSession = {
    ...session,
    items: graded,
    status: 'completed',
    completedAt: now,
    autoSubmitted: auto,
    answeredCount,
    correctCount,
    updatedAt: now,
    pending: 1,
    rev: (session.rev ?? 0) + 1,
  }
  void tx.objectStore('sessions').put(done)
  const events: { questionId: number; clientId: string; correct: boolean }[] = []
  for (const g of graded) {
    const clientId = crypto.randomUUID()
    events.push({ questionId: g.questionId, clientId, correct: g.isCorrect })
    void tx.objectStore('attempts').put({
      id: clientId,
      clientId,
      questionId: g.questionId,
      sessionId,
      mode: 'exam',
      selectedKey: g.selectedKey,
      selfGrade: null,
      isCorrect: g.isCorrect,
      responseMs: null,
      answeredAt: now,
      pending: 1,
    })
  }
  await tx.done
  for (const e of events) applyLocalEvent(e.questionId, { kind: 'answer', id: e.clientId, at: now, correct: e.correct })
  requestPush()
  return done
}

/** Auto-submit every exam on this device whose timer ran out. */
export async function finalizeExpiredExams() {
  const sessions = await (await openLocalDb()).getAll('sessions')
  const now = Date.now()
  for (const s of sessions) if (s.mode === 'exam' && expired(s, now)) await gradeExam(s.id, true)
}

/** Draw a mock exam (proportional per module) and start its timer. */
export async function startExam({ data }: { data: z.input<typeof startExamSchema> }) {
  const input = startExamSchema.parse(data)
  const s = await ensureLocal()
  const filters = { moduleSlugs: input.moduleSlugs, topicIds: [], sourceSlugs: [], scope: 'all' as const }
  const ids = buildExam({
    candidates: selectCandidates({ index: s.index.values(), progress: s.progress, filters, now: new Date() }),
    count: input.count,
    seed: randomSeed(),
  })
  if (!ids.length) throw new Error('No questions are available for this exam.')
  const startedAt = new Date()
  const durationSec = input.durationMin * 60
  const session: LocalSession = {
    id: crypto.randomUUID(),
    mode: 'exam',
    status: 'active',
    filters,
    orderMode: 'random',
    questionCount: ids.length,
    startedAt,
    durationSec,
    expiresAt: new Date(startedAt.getTime() + durationSec * 1000),
    completedAt: null,
    autoSubmitted: false,
    answeredCount: 0,
    correctCount: 0,
    updatedAt: startedAt,
    items: ids.map((questionId, position) => ({
      position,
      questionId,
      selectedKey: null,
      isCorrect: null,
      answeredAt: null,
      responseMs: null,
      flagged: false,
    })),
    // Not uploaded while it runs (see the note at the top).
    pending: 0,
    rev: 0,
  }
  await (await openLocalDb()).put('sessions', session)
  return { id: session.id }
}

/** The exam paper without answers; auto-submits if time already ran out. */
export async function getExam({ data }: { data: { id: string } }) {
  await ensureLocal()
  let session = await getExamSession(data.id)
  if (expired(session)) session = await gradeExam(session.id, true)
  const views = await loadViews(session.items.map((i) => i.questionId))
  return {
    serverNow: new Date(),
    session: {
      id: session.id,
      status: session.status,
      questionCount: session.questionCount,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt ?? session.startedAt,
      durationSec: session.durationSec ?? 0,
      filters: session.filters,
    },
    items: session.items.flatMap((item) => {
      const q = views.get(item.questionId)
      return q
        ? [{ position: item.position, selectedKey: item.selectedKey, flagged: item.flagged, question: withoutAnswers(q) }]
        : []
    }),
  }
}

/** Save one exam answer (or flag) on this device. */
export async function saveExamAnswer({
  data,
}: {
  data: { sessionId: string; position: number; selectedKey: ChoiceKey | null; flagged?: boolean }
}) {
  const db = await openLocalDb()
  const tx = db.transaction('sessions', 'readwrite')
  const session = await tx.store.get(data.sessionId)
  if (!session || session.mode !== 'exam') throw new Error('Exam not found')
  if (session.status !== 'active') throw new Error('This exam has already been submitted.')
  if (expired(session)) throw new Error('Time is up — this answer was not saved.')
  const item = session.items.find((i) => i.position === data.position)
  if (!item) throw new Error('Question not found in this exam')
  item.selectedKey = data.selectedKey
  item.answeredAt = data.selectedKey ? new Date() : null
  if (data.flagged !== undefined) item.flagged = data.flagged
  await tx.store.put({ ...session, updatedAt: new Date() })
  await tx.done
  return { ok: true }
}

/** Hand in the exam. */
export async function submitExam({ data }: { data: { id: string } }) {
  const graded = await gradeExam(data.id, false)
  return { id: graded.id, status: graded.status }
}

/** Score, per-topic breakdown and every item with its rationale. */
export async function getExamResult({ data }: { data: { id: string } }) {
  await ensureLocal()
  const session = await getExamSession(data.id)
  if (session.status === 'active') return { status: 'active' as const, id: session.id }
  const views = await loadViews(session.items.map((i) => i.questionId))
  const rows = session.items.flatMap((item) => {
    const q = views.get(item.questionId)
    return q
      ? [
          {
            position: item.position,
            selectedKey: item.selectedKey,
            isCorrect: item.isCorrect ?? false,
            flagged: item.flagged,
            question: q,
          },
        ]
      : []
  })
  const breakdown = new Map<
    string,
    { key: string; moduleCode: string; accentHue: number; topic: string; total: number; correct: number }
  >()
  for (const r of rows) {
    const key = `${r.question.module.code}:${r.question.topic ?? 'Unsorted'}`
    const b = breakdown.get(key) ?? {
      key,
      moduleCode: r.question.module.code,
      accentHue: r.question.module.accentHue,
      topic: r.question.topic ?? 'Unsorted',
      total: 0,
      correct: 0,
    }
    b.total++
    if (r.isCorrect) b.correct++
    breakdown.set(key, b)
  }
  return {
    status: 'completed' as const,
    id: session.id,
    session: {
      questionCount: session.questionCount,
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationSec: session.durationSec,
      autoSubmitted: session.autoSubmitted,
    },
    topics: [...breakdown.values()],
    items: rows,
  }
}

/** The last 20 mock exams on this device (finished ones from other devices included). */
export async function listExams() {
  await finalizeExpiredExams()
  const sessions = await (await openLocalDb()).getAll('sessions')
  return sessions
    .filter((s) => s.mode === 'exam')
    .sort(byNewest((s) => s.startedAt))
    .slice(0, 20)
    .map((s) => ({
      id: s.id,
      status: s.status,
      questionCount: s.questionCount,
      answeredCount: s.answeredCount,
      correctCount: s.correctCount,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      expiresAt: s.expiresAt,
      durationSec: s.durationSec,
      autoSubmitted: s.autoSubmitted,
      filters: s.filters,
    }))
}
