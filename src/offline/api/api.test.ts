import 'fake-indexeddb/auto'

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine talks to the server; these tests only exercise the device side.
vi.mock('../sync/engine', () => ({ requestPush: () => {}, requestSync: async () => {} }))

import { deleteLocalDb, type LocalIndex, type LocalQuestion, openLocalDb, selectLocalDb, setMeta } from '../db.ts'
import { localStore, loadLocalState } from '../store.ts'
import { push } from '../sync/push.ts'
import type { SyncTransport } from '../sync/pull.ts'
import { getDashboard, getReviewHub } from './dashboard.ts'
import { getExam, getExamResult, listExams, saveExamAnswer, startExam, submitExam } from './exam.ts'
import { completeSession, getSession, getSessionSummary, recordAnswer, startSession, toggleBookmark } from './study.ts'

const module = { slug: 'm1', code: 'M1', shortName: 'Chem', accentHue: 290 }

function question(id: number, answerKey: 'A' | 'B'): { index: LocalIndex; view: LocalQuestion } {
  return {
    index: {
      id,
      moduleId: 1,
      moduleSlug: 'm1',
      topicId: 10,
      sourceSlug: 'pb1',
      groupId: null,
      groupOrder: null,
      sortKey: [0, 0, id],
      eligible: true,
      archived: false,
      h: 'x',
    },
    view: {
      id,
      format: 'single',
      stem: `Question ${id}`,
      statements: [],
      choices: [
        { key: 'A', text: 'one' },
        { key: 'B', text: 'two' },
      ],
      context: null,
      groupId: null,
      groupOrder: null,
      module,
      topic: 'Organic',
      source: 'PB1',
      printedNumber: String(id),
      images: [],
      bookmarked: false,
      answerKey,
      rationale: 'because',
      mnemonic: '',
    },
  }
}

const filters = { moduleSlugs: [], topicIds: [], sourceSlugs: [], scope: 'all' as const }

beforeEach(async () => {
  const db = await openLocalDb()
  for (const q of [question(1, 'A'), question(2, 'B'), question(3, 'A')]) {
    await db.put('qindex', q.index)
    await db.put('questions', q.view)
  }
  await db.put(
    'taxonomy',
    {
      modules: [
        {
          id: 1,
          slug: 'm1',
          code: 'M1',
          name: 'Chemistry',
          shortName: 'Chem',
          description: '',
          accentHue: 290,
          subjects: [{ id: 5, slug: 's', name: 'Pharm Chem', topics: [{ id: 10, slug: 't', name: 'Organic', questionCount: 3 }] }],
        },
      ],
      sources: [],
      unsortedCount: 0,
      moduleSources: {},
    },
    'current',
  )
  await setMeta('content', { hash: 'h', syncedAt: new Date(), needsReview: 0, questionTotal: 3 })
  await loadLocalState()
})

// One person's copy (the guard picks it in the app).
beforeAll(async () => {
  await selectLocalDb('flashquizz-test')
})

afterEach(async () => {
  await deleteLocalDb()
})

describe('practice on the device', () => {
  it('starts, answers, bookmarks and summarises a session without the server', async () => {
    const { id } = await startSession({ data: { mode: 'practice', filters, count: 3, order: 'sequential' } })
    const { items } = await getSession({ data: { id } })
    expect(items.map((i) => i.question.id)).toEqual([1, 2, 3])

    const right = await recordAnswer({ data: { sessionId: id, position: 0, selectedKey: 'A' } })
    const wrong = await recordAnswer({ data: { sessionId: id, position: 1, selectedKey: 'A' } })
    expect(right).toMatchObject({ isCorrect: true, box: 0 })
    expect(wrong).toMatchObject({ isCorrect: false, box: 1 })
    expect(await recordAnswer({ data: { sessionId: id, position: 1, selectedKey: 'B' } })).toMatchObject({
      alreadyAnswered: true,
    })

    await toggleBookmark({ data: { questionId: 3, bookmarked: true } })
    expect(localStore.state.progress.get(3)).toMatchObject({ bookmarked: true, box: 1 })

    const db = await openLocalDb()
    expect(await db.countFromIndex('attempts', 'pending', 1)).toBe(2)
    expect(await db.countFromIndex('bookmarkEvents', 'pending', 1)).toBe(1)

    const dash = await getDashboard()
    expect(dash.today).toEqual({ answered: 2, correct: 1 })
    expect(dash.overall).toMatchObject({ total: 3, seen: 2, due: 2, bookmarked: 1, missed: 1 })
    expect(dash.activeSessions.map((s) => s.id)).toEqual([id])

    const hub = await getReviewHub()
    expect(hub.bookmarks.map((b) => b.id)).toEqual([3])
    expect(hub.boxes).toEqual([{ box: 1, n: 2 }])

    await completeSession({ data: { id } })
    const summary = await getSessionSummary({ data: { id } })
    expect(summary.session).toMatchObject({ status: 'completed', answeredCount: 2, correctCount: 1 })
    expect(summary.missed.map((m) => m.position)).toEqual([1])
  })

  it('progress survives a reload: unsynced answers are re-applied on top', async () => {
    const { id } = await startSession({ data: { mode: 'practice', filters, count: 1, order: 'sequential' } })
    await recordAnswer({ data: { sessionId: id, position: 0, selectedKey: 'B' } })
    await loadLocalState()
    expect(localStore.state.progress.get(1)).toMatchObject({ box: 1, lastCorrect: false })
  })
})

describe('mock exams on the device', () => {
  it('stays local while running, then grades blanks as wrong and queues every item', async () => {
    const { id } = await startExam({ data: { moduleSlugs: [], count: 5, durationMin: 30 } })
    const paper = await getExam({ data: { id } })
    expect(paper.items).toHaveLength(3)
    expect('answerKey' in paper.items[0].question).toBe(false)
    const db = await openLocalDb()
    expect((await db.get('sessions', id))?.pending).toBe(0)

    const byId = new Map(paper.items.map((i) => [i.question.id, i.position]))
    await saveExamAnswer({ data: { sessionId: id, position: byId.get(1) ?? 0, selectedKey: 'A' } })
    await saveExamAnswer({ data: { sessionId: id, position: byId.get(2) ?? 0, selectedKey: 'A' } })
    await submitExam({ data: { id } })

    const result = await getExamResult({ data: { id } })
    if (result.status !== 'completed') throw new Error('not graded')
    expect(result.session).toMatchObject({ questionCount: 3, answeredCount: 2, correctCount: 1, autoSubmitted: false })
    expect(await db.countFromIndex('attempts', 'pending', 1)).toBe(3)
    expect((await db.get('sessions', id))?.pending).toBe(1)
    expect(localStore.state.progress.get(3)).toMatchObject({ box: 1, lastCorrect: false })
  })

  it('auto-submits an exam whose time ran out', async () => {
    const { id } = await startExam({ data: { moduleSlugs: [], count: 5, durationMin: 5 } })
    const db = await openLocalDb()
    const s = await db.get('sessions', id)
    if (!s) throw new Error('missing')
    await db.put('sessions', { ...s, expiresAt: new Date(Date.now() - 60_000) })
    const [exam] = await listExams()
    expect(exam).toMatchObject({ id, status: 'completed', autoSubmitted: true })
  })
})

describe('push', () => {
  function fakeTransport(reject: (kind: string, id: string) => boolean = () => false) {
    const calls: { sessions: number; attempts: number; bookmarks: number }[] = []
    const transport = {
      push: async (changes: { sessions: { id: string }[]; attempts: { clientId: string; questionId: number }[]; bookmarkEvents: { clientId: string }[] }) => {
        calls.push({ sessions: changes.sessions.length, attempts: changes.attempts.length, bookmarks: changes.bookmarkEvents.length })
        const rejected = [
          ...changes.sessions.filter((s) => reject('session', s.id)).map((s) => ({ kind: 'session', id: s.id, reason: 'no' })),
          ...changes.attempts.filter((a) => reject('attempt', a.clientId)).map((a) => ({ kind: 'attempt', id: a.clientId, reason: 'no' })),
        ]
        const progress = changes.attempts.map((a) => ({
          questionId: a.questionId,
          box: 4,
          dueAt: null,
          seenCount: 9,
          correctCount: 9,
          wrongCount: 0,
          streak: 9,
          lastCorrect: true,
          lastAnsweredAt: new Date(),
          bookmarked: false,
          bookmarkedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
        return { serverTime: new Date(), accepted: { attempts: 0, bookmarkEvents: 0, sessions: 0 }, rejected, progress }
      },
    }
    return { transport: transport as unknown as SyncTransport, calls }
  }

  it('sends sessions first, keeps running exams back, and clears what was accepted', async () => {
    const { id } = await startSession({ data: { mode: 'practice', filters, count: 2, order: 'sequential' } })
    await recordAnswer({ data: { sessionId: id, position: 0, selectedKey: 'A' } })
    await toggleBookmark({ data: { questionId: 2, bookmarked: true } })
    const exam = await startExam({ data: { moduleSlugs: [], count: 5, durationMin: 30 } })

    const { transport, calls } = fakeTransport()
    const result = await push(transport)
    expect(calls).toEqual([
      { sessions: 1, attempts: 0, bookmarks: 0 },
      { sessions: 0, attempts: 1, bookmarks: 1 },
    ])
    expect(result).toEqual({ sent: 3, refused: 0 })
    const db = await openLocalDb()
    expect(await db.countFromIndex('attempts', 'pending', 1)).toBe(0)
    expect(await db.countFromIndex('bookmarkEvents', 'pending', 1)).toBe(0)
    expect((await db.get('sessions', id))?.pending).toBe(0)
    expect((await db.get('sessions', exam.id))?.status).toBe('active')
    // The server's rebuilt progress replaces the local copy.
    expect((await db.get('progress', 1))?.box).toBe(4)
  })

  it('moves refused records aside instead of retrying them', async () => {
    const { id } = await startSession({ data: { mode: 'practice', filters, count: 1, order: 'sequential' } })
    await recordAnswer({ data: { sessionId: id, position: 0, selectedKey: 'A' } })
    const db = await openLocalDb()
    const [attempt] = await db.getAllFromIndex('attempts', 'pending', 1)
    const { transport } = fakeTransport((kind, rid) => kind === 'attempt' && rid === attempt.id)
    expect((await push(transport)).refused).toBe(1)
    expect(await db.get('attempts', attempt.id)).toBeUndefined()
    expect((await db.get('deadLetters', attempt.id))?.reason).toBe('no')
  })

  it('keeps a session queued if it changed during the upload', async () => {
    const { id } = await startSession({ data: { mode: 'practice', filters, count: 2, order: 'sequential' } })
    const db = await openLocalDb()
    const transport = {
      push: async () => {
        // Another answer lands while the upload is in flight.
        await recordAnswer({ data: { sessionId: id, position: 0, selectedKey: 'A' } })
        return { serverTime: new Date(), accepted: { attempts: 0, bookmarkEvents: 0, sessions: 1 }, rejected: [], progress: [] }
      },
    } as unknown as SyncTransport
    await push(transport)
    expect((await db.get('sessions', id))?.pending).toBe(1)
  })
})
