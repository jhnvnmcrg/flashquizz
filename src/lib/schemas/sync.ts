import { z } from 'zod'

import { choiceKeySchema, sessionModeSchema, sessionStatusSchema, studyOrderSchema } from './enums.ts'
import { studyFiltersSchema } from './study.ts'

/** Bump whenever a sync payload changes shape; older installed apps are told to update. */
export const SYNC_PROTOCOL = 2

/** Returned (as the error message prefix) when an installed app is older than the server. */
export const SYNC_PROTOCOL_MISMATCH = 'SYNC_PROTOCOL_MISMATCH'

/** Returned when the signed-in account isn't the person whose device copy is syncing. */
export const SYNC_WRONG_USER = 'SYNC_WRONG_USER'

const protocol = z.number().int()
/**
 * Whose device copy is syncing. The server refuses when another account is
 * signed in, so one person's copy never takes in (or uploads) another's data.
 * Optional only so older apps still get the protocol message.
 */
const userId = z.string().max(64).optional()
const questionId = z.number().int().positive()

/** Keyset position inside one paged pull: the last row's (timestamp, id). */
export const keysetSchema = z.object({ at: z.coerce.date(), id: z.string().max(64) })
export type Keyset = z.infer<typeof keysetSchema>

export const syncManifestInput = z.object({
  protocol,
  userId,
  /** The content hash the device already holds; the server answers `unchanged` when it matches. */
  contentHash: z.string().max(64).nullish(),
})

export const syncQuestionsInput = z.object({
  protocol,
  userId,
  ids: z.array(questionId).min(1).max(250),
})

export const syncSinceInput = z.object({
  protocol,
  userId,
  /** Window start (the device's last pull, minus an overlap). Null on the first pull. */
  since: z.coerce.date().nullable(),
  /** Where the previous page of this pull ended. */
  after: keysetSchema.nullable(),
})

export const attemptUploadSchema = z.object({
  clientId: z.uuid(),
  questionId,
  sessionId: z.uuid().nullable(),
  mode: sessionModeSchema,
  selectedKey: choiceKeySchema.nullable(),
  /** Flashcards only: the self-grade. Every other mode is graded on the server. */
  selfGrade: z.enum(['again', 'got_it']).nullable(),
  responseMs: z.number().int().min(0).max(3_600_000).nullable(),
  answeredAt: z.coerce.date(),
})

export const bookmarkUploadSchema = z.object({
  clientId: z.uuid(),
  questionId,
  bookmarked: z.boolean(),
  at: z.coerce.date(),
})

export const sessionItemUploadSchema = z.object({
  position: z.number().int().min(0).max(499),
  questionId,
  selectedKey: choiceKeySchema.nullable(),
  /** Trusted only for flashcards (self-graded); recomputed from answer keys otherwise. */
  isCorrect: z.boolean().nullable(),
  answeredAt: z.coerce.date().nullable(),
  responseMs: z.number().int().min(0).max(3_600_000).nullable(),
  flagged: z.boolean(),
})

export const sessionUploadSchema = z.object({
  id: z.uuid(),
  mode: sessionModeSchema,
  status: sessionStatusSchema,
  filters: studyFiltersSchema,
  orderMode: studyOrderSchema,
  startedAt: z.coerce.date(),
  durationSec: z.number().int().min(60).max(18_000).nullable(),
  expiresAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  autoSubmitted: z.boolean(),
  items: z.array(sessionItemUploadSchema).min(1).max(250),
})

export const pushChangesInput = z.object({
  protocol,
  userId,
  attempts: z.array(attemptUploadSchema).max(500).default([]),
  bookmarkEvents: z.array(bookmarkUploadSchema).max(500).default([]),
  sessions: z.array(sessionUploadSchema).max(50).default([]),
})

export type AttemptUpload = z.infer<typeof attemptUploadSchema>
export type BookmarkUpload = z.infer<typeof bookmarkUploadSchema>
export type SessionUpload = z.infer<typeof sessionUploadSchema>
export type PushChanges = z.infer<typeof pushChangesInput>

/** A record the server refused; the device sets it aside instead of retrying forever. */
export type SyncRejection = {
  kind: 'attempt' | 'bookmark' | 'session'
  id: string
  reason: string
}
