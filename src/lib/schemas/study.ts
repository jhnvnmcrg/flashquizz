import { z } from 'zod'

import { choiceKeySchema, studyOrderSchema, studyScopeSchema } from './enums.ts'

export const studyFiltersSchema = z.object({
  moduleSlugs: z.array(z.string()).default([]),
  topicIds: z.array(z.number().int().positive()).default([]),
  sourceSlugs: z.array(z.string()).default([]),
  scope: studyScopeSchema.default('all'),
  fromSessionId: z.uuid().nullish(),
})

export type StudyFilters = z.infer<typeof studyFiltersSchema>

export const startSessionSchema = z.object({
  mode: z.enum(['flashcards', 'practice', 'review']),
  filters: studyFiltersSchema,
  count: z.number().int().min(1).max(200),
  order: studyOrderSchema,
})

export const sessionIdSchema = z.object({ id: z.uuid() })

export const recordAnswerSchema = z.object({
  sessionId: z.uuid(),
  position: z.number().int().nonnegative(),
  selectedKey: choiceKeySchema.nullable(),
  /** Flashcards: self-grade instead of a selected choice. */
  selfGrade: z.enum(['again', 'got_it']).nullish(),
  responseMs: z.number().int().nonnegative().max(3_600_000).nullish(),
})

export const toggleBookmarkSchema = z.object({
  questionId: z.number().int().positive(),
  bookmarked: z.boolean(),
})

export const startExamSchema = z.object({
  moduleSlugs: z.array(z.string()).default([]),
  count: z.number().int().min(5).max(200),
  durationMin: z.number().int().min(5).max(300),
})

export const saveExamAnswerSchema = z.object({
  sessionId: z.uuid(),
  position: z.number().int().nonnegative(),
  selectedKey: choiceKeySchema.nullable(),
  flagged: z.boolean().optional(),
})
