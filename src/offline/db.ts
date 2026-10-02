import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from 'idb'

import type { ProgressState } from '#/lib/leitner'
import type { QuestionAnswer, QuestionView } from '#/lib/question-view'
import type { ChoiceKey, SessionMode, SessionStatus, StudyOrder } from '#/lib/schemas/enums'
import type { StudyFilters } from '#/lib/schemas/study'
import type { SyncRejection } from '#/lib/schemas/sync'
import type { IndexedQuestion } from '#/lib/study/candidates'
import type { SyncManifest } from '#/server/sync.server'

/**
 * The device's copy of FlashQuizz (IndexedDB). Question images live in Cache
 * Storage instead (`fq-images`), which is sturdier for binary data on iOS.
 */
export const DB_NAME = 'flashquizz'
const DB_VERSION = 1

type FullManifest = Extract<SyncManifest, { unchanged: false }>
export type LocalTaxonomy = FullManifest['taxonomy']
export type ManifestImage = FullManifest['images'][number]

/** In-memory index entry, plus the content hash of the copy we hold. */
export type LocalIndex = IndexedQuestion & { archived: boolean; h: string }
export type LocalQuestion = QuestionView & QuestionAnswer
/** Progress as last confirmed by the server (unsynced events are applied on top in memory). */
export type LocalProgress = ProgressState & { questionId: number; updatedAt: Date }

export type LocalSessionItem = {
  position: number
  questionId: number
  selectedKey: ChoiceKey | null
  isCorrect: boolean | null
  answeredAt: Date | null
  responseMs: number | null
  flagged: boolean
}

export type LocalSession = {
  id: string
  mode: SessionMode
  status: SessionStatus
  filters: StudyFilters
  orderMode: StudyOrder
  questionCount: number
  startedAt: Date
  durationSec: number | null
  expiresAt: Date | null
  completedAt: Date | null
  autoSubmitted: boolean
  answeredCount: number
  correctCount: number
  updatedAt: Date
  items: LocalSessionItem[]
  /** 1 while it holds changes not yet uploaded (IndexedDB can't index booleans). */
  pending: 0 | 1
  /** Bumped on every local change, so an upload only clears `pending` if nothing changed meanwhile. */
  rev?: number
}

export type LocalAttempt = {
  /** The device's client id, or the server row id for attempts from elsewhere. */
  id: string
  clientId: string | null
  questionId: number
  sessionId: string | null
  mode: SessionMode
  selectedKey: ChoiceKey | null
  selfGrade: 'again' | 'got_it' | null
  isCorrect: boolean
  responseMs: number | null
  answeredAt: Date
  pending: 0 | 1
}

export type LocalBookmarkEvent = {
  clientId: string
  questionId: number
  bookmarked: boolean
  at: Date
  pending: 0 | 1
}

/** A record the server refused, kept for the Offline page instead of retried forever. */
export type DeadLetter = SyncRejection & { record: unknown; at: Date }

export type Meta = {
  /** Last time the server confirmed this device belongs to the owner. */
  owner: { userId: string; confirmedAt: Date }
  content: { hash: string; syncedAt: Date; needsReview: number; questionTotal: number }
  images: ManifestImage[]
  watermarks: { progress: Date | null; sessions: Date | null; attempts: Date | null }
  lastSync: { at: Date; ok: boolean; error: string | null }
}

interface FlashQuizzDB extends DBSchema {
  meta: { key: string; value: unknown }
  taxonomy: { key: 'current'; value: LocalTaxonomy }
  qindex: { key: number; value: LocalIndex }
  questions: { key: number; value: LocalQuestion }
  progress: { key: number; value: LocalProgress }
  sessions: { key: string; value: LocalSession; indexes: { pending: number } }
  attempts: { key: string; value: LocalAttempt; indexes: { pending: number; clientId: string } }
  bookmarkEvents: { key: string; value: LocalBookmarkEvent; indexes: { pending: number } }
  deadLetters: { key: string; value: DeadLetter }
}

export type LocalDb = IDBPDatabase<FlashQuizzDB>

let opening: Promise<LocalDb> | null = null

export function openLocalDb() {
  opening ??= openDB<FlashQuizzDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('meta')
      db.createObjectStore('taxonomy')
      db.createObjectStore('qindex', { keyPath: 'id' })
      db.createObjectStore('questions', { keyPath: 'id' })
      db.createObjectStore('progress', { keyPath: 'questionId' })
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('pending', 'pending')
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('pending', 'pending')
      attempts.createIndex('clientId', 'clientId')
      db.createObjectStore('bookmarkEvents', { keyPath: 'clientId' }).createIndex('pending', 'pending')
      db.createObjectStore('deadLetters', { keyPath: 'id' })
    },
    blocking() {
      // A newer version of the app wants to upgrade the database: step aside.
      void closeLocalDb()
    },
  })
  return opening
}

export async function closeLocalDb() {
  const db = await opening?.catch(() => null)
  opening = null
  db?.close()
}

export async function getMeta<K extends keyof Meta>(key: K): Promise<Meta[K] | undefined> {
  return (await (await openLocalDb()).get('meta', key)) as Meta[K] | undefined
}

export async function setMeta<K extends keyof Meta>(key: K, value: Meta[K]) {
  await (await openLocalDb()).put('meta', value, key)
}

/** Changes made on this device that haven't reached the server yet. */
export async function countPending() {
  const db = await openLocalDb()
  const [attempts, bookmarks, sessions] = await Promise.all([
    db.countFromIndex('attempts', 'pending', 1),
    db.countFromIndex('bookmarkEvents', 'pending', 1),
    db.countFromIndex('sessions', 'pending', 1),
  ])
  return { attempts, bookmarks, sessions, total: attempts + bookmarks + sessions }
}

/** Remove the whole local copy (questions, progress, sessions, queued answers). */
export async function deleteLocalDb() {
  await closeLocalDb()
  await deleteDB(DB_NAME)
}
