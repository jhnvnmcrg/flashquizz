import 'fake-indexeddb/auto'

import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { Keyset } from '../../lib/schemas/sync.ts'
import { deleteLocalDb, getMeta, type LocalSession, openLocalDb, selectLocalDb } from '../db.ts'
import { pull, type SyncTransport } from './pull.ts'

const T0 = new Date('2026-10-01T08:00:00Z')
const at = (s: number) => new Date(T0.getTime() + s * 1000)

type FakeQuestion = { id: number; h: string }

/** An in-memory server with keyset paging, recording what the device asked for. */
function fakeServer(opts: {
  questions: FakeQuestion[]
  progress?: { questionId: number; updatedAt: Date; box: number }[]
  sessions?: Record<string, unknown>[]
  attempts?: { id: string; clientId: string | null; questionId: number; createdAt: Date }[]
  pageSize?: number
}) {
  const calls = { questions: [] as number[][], manifestHashes: [] as (string | null)[] }
  const pageSize = opts.pageSize ?? 1000
  const hash = () => opts.questions.map((q) => `${q.id}:${q.h}`).join(',')
  const page = <T extends { at: Date; id: string }>(rows: T[], since: Date | null, after: Keyset | null) => {
    const sorted = rows
      .filter((r) => !since || r.at >= since)
      .filter((r) => !after || r.at > after.at || (r.at.getTime() === after.at.getTime() && r.id > after.id))
      .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : 1))
      .slice(0, pageSize)
    const last = sorted.at(-1)
    return { sorted, next: sorted.length === pageSize && last ? { at: last.at, id: last.id } : null }
  }
  const transport = {
    manifest: async (contentHash: string | null) => {
      calls.manifestHashes.push(contentHash)
      if (contentHash === hash()) return { unchanged: true, hash: hash(), serverTime: at(100) }
      return {
        unchanged: false,
        hash: hash(),
        serverTime: at(100),
        questions: opts.questions,
        images: [{ id: 7, h: 'img' }],
        taxonomy: { modules: [], sources: [], unsortedCount: 0, moduleSources: {} },
        needsReview: 3,
      }
    },
    questions: async (ids: number[]) => {
      calls.questions.push(ids)
      return ids.map((id) => ({
        h: opts.questions.find((q) => q.id === id)?.h ?? '',
        index: { id, moduleId: 1, moduleSlug: 'm1', topicId: null, sourceSlug: 'pb1', groupId: null, groupOrder: null, sortKey: [0, 0, id], eligible: true, archived: false },
        view: { id, stem: `Question ${id}` },
      }))
    },
    progressSince: async (since: Date | null, after: Keyset | null) => {
      const { sorted, next } = page(
        (opts.progress ?? []).map((p) => ({ ...p, at: p.updatedAt, id: String(p.questionId) })),
        since,
        after,
      )
      return { rows: sorted, next }
    },
    sessionsSince: async (since: Date | null, after: Keyset | null) => {
      const { sorted, next } = page(
        (opts.sessions ?? []).map((s) => ({ ...s, at: s.updatedAt as Date, id: s.id as string })),
        since,
        after,
      )
      return { rows: sorted, next }
    },
    attemptsSince: async (since: Date | null, after: Keyset | null) => {
      const { sorted, next } = page(
        (opts.attempts ?? []).map((a) => ({ ...a, at: a.createdAt, mode: 'practice', sessionId: null, isCorrect: true, answeredAt: a.createdAt })),
        since,
        after,
      )
      return { rows: sorted, next }
    },
    push: async () => {
      throw new Error('not used')
    },
  }
  return { transport: transport as unknown as SyncTransport, calls }
}

// One person's copy (the guard picks it in the app).
beforeAll(async () => {
  await selectLocalDb('flashquizz-test')
})

afterEach(async () => {
  await deleteLocalDb()
})

describe('pull', () => {
  it('downloads the question bank in pages and records where it got to', async () => {
    const questions = Array.from({ length: 260 }, (_, i) => ({ id: i + 1, h: 'v1' }))
    const { transport, calls } = fakeServer({ questions })
    const steps: string[] = []
    await pull(transport, (p) => steps.push(`${p.step}:${p.done}/${p.total}`))

    const db = await openLocalDb()
    expect(await db.count('qindex')).toBe(260)
    expect(await db.count('questions')).toBe(260)
    expect(calls.questions.map((c) => c.length)).toEqual([250, 10])
    expect(steps).toContain('questions:260/260')
    expect(await getMeta('content')).toMatchObject({ needsReview: 3, questionTotal: 260 })
    expect(await getMeta('images')).toEqual([{ id: 7, h: 'img' }])
    // Next window starts 5 minutes before this pull began.
    expect((await getMeta('watermarks'))?.progress).toEqual(new Date(at(100).getTime() - 5 * 60_000))
  })

  it('skips the download when nothing changed, and fetches only changed questions', async () => {
    const questions = [
      { id: 1, h: 'v1' },
      { id: 2, h: 'v1' },
      { id: 3, h: 'v1' },
    ]
    const server = fakeServer({ questions })
    await pull(server.transport)
    await pull(server.transport)
    expect(server.calls.questions).toHaveLength(1)

    questions[1].h = 'v2'
    questions.splice(2, 1) // question 3 removed on the server
    await pull(server.transport)
    expect(server.calls.questions.at(-1)).toEqual([2])
    const db = await openLocalDb()
    expect((await db.get('qindex', 2))?.h).toBe('v2')
    expect(await db.get('qindex', 3)).toBeUndefined()
  })

  it('keeps a removed question an unsent local session still shows', async () => {
    const questions = [
      { id: 1, h: 'v1' },
      { id: 2, h: 'v1' },
    ]
    const server = fakeServer({ questions })
    await pull(server.transport)
    const db = await openLocalDb()
    await db.put('sessions', {
      id: 'local-1',
      mode: 'practice',
      status: 'active',
      items: [{ position: 0, questionId: 2, selectedKey: 'A', isCorrect: true, answeredAt: at(5), responseMs: 1, flagged: false }],
      pending: 1,
    } as unknown as LocalSession)
    questions.pop()
    await pull(server.transport)
    expect(await db.get('qindex', 2)).toBeDefined()
  })

  it('pages through progress, merges pending sessions and confirms queued answers', async () => {
    const server = fakeServer({
      questions: [{ id: 1, h: 'v1' }],
      pageSize: 2,
      progress: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, updatedAt: at(questionId), box: questionId })),
      sessions: [
        {
          id: 's1',
          mode: 'practice',
          status: 'active',
          updatedAt: at(10),
          answeredCount: 1,
          correctCount: 1,
          items: [
            { position: 0, questionId: 1, selectedKey: 'A', isCorrect: true, answeredAt: at(1), responseMs: 1, flagged: false },
            { position: 1, questionId: 2, selectedKey: null, isCorrect: null, answeredAt: null, responseMs: null, flagged: false },
          ],
        },
      ],
      attempts: [{ id: '99', clientId: 'c-1', questionId: 1, createdAt: at(20) }],
    })
    const db = await openLocalDb()
    // This device answered item 1 offline and queued the attempt.
    await db.put('sessions', {
      id: 's1',
      mode: 'practice',
      status: 'active',
      items: [
        { position: 0, questionId: 1, selectedKey: null, isCorrect: null, answeredAt: null, responseMs: null, flagged: false },
        { position: 1, questionId: 2, selectedKey: 'C', isCorrect: false, answeredAt: at(30), responseMs: 2, flagged: false },
      ],
      pending: 1,
    } as unknown as LocalSession)
    await db.put('attempts', {
      id: 'c-1',
      clientId: 'c-1',
      questionId: 1,
      sessionId: null,
      mode: 'practice',
      selectedKey: 'A',
      selfGrade: null,
      isCorrect: true,
      responseMs: 1,
      answeredAt: at(20),
      pending: 1,
    })

    await pull(server.transport)
    expect(await db.count('progress')).toBe(5)
    const s1 = await db.get('sessions', 's1')
    expect(s1?.items.map((i) => i.selectedKey)).toEqual(['A', 'C'])
    expect(s1?.pending).toBe(1)
    expect((await db.get('attempts', 'c-1'))?.pending).toBe(0)
  })
})
