import { z } from 'zod'

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')

export const taxonomyTopicSchema = z.object({
  slug,
  name: z.string().min(1),
})

export const taxonomySubjectSchema = z.object({
  slug,
  name: z.string().min(1),
  topics: z.array(taxonomyTopicSchema).min(1),
})

export const taxonomyModuleSchema = z.object({
  slug: z.string().regex(/^m[1-6]$/),
  code: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  description: z.string().default(''),
  accentHue: z.number().int().min(0).max(360),
  subjects: z.array(taxonomySubjectSchema).min(1),
})

export const taxonomySourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+$/),
  name: z.string().min(1),
  shortName: z.string().min(1),
})

export const taxonomyImportSchema = z.object({
  modules: z.array(taxonomyModuleSchema).length(6),
  sources: z.array(taxonomySourceSchema),
})

export type TaxonomyImport = z.input<typeof taxonomyImportSchema>

export const saveModuleSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  description: z.string(),
  accentHue: z.number().int().min(0).max(360),
})

export const saveSubjectSchema = z.object({
  id: z.number().int().positive().nullable(),
  moduleId: z.number().int().positive(),
  name: z.string().trim().min(1),
})

export const saveTopicSchema = z.object({
  id: z.number().int().positive().nullable(),
  subjectId: z.number().int().positive(),
  name: z.string().trim().min(1),
})

export const deleteTopicSchema = z.object({
  id: z.number().int().positive(),
  reassignTo: z.number().int().positive().nullable(),
})

export const reorderSchema = z.object({
  kind: z.enum(['subject', 'topic']),
  ids: z.array(z.number().int().positive()).min(1),
})
