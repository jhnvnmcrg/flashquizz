import { z } from 'zod'

import { studyOrderSchema, studyScopeSchema } from './enums.ts'

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

export const startExamSchema = z.object({
  moduleSlugs: z.array(z.string()).default([]),
  count: z.number().int().min(5).max(200),
  durationMin: z.number().int().min(5).max(300),
})
