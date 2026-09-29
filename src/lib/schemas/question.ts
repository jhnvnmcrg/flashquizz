import { z } from 'zod'

import {
  CHOICE_KEYS,
  choiceKeySchema,
  imageRoleSchema,
  questionFlagSchema,
  questionFormatSchema,
  questionStatusSchema,
  statementLabelSchema,
} from './enums.ts'

export const choiceSchema = z.object({
  key: choiceKeySchema,
  text: z.string().trim().min(1, 'Choice text is required'),
})

export const statementSchema = z.object({
  label: statementLabelSchema,
  text: z.string().trim().min(1, 'Statement text is required'),
})

export type Choice = z.infer<typeof choiceSchema>
export type Statement = z.infer<typeof statementSchema>

export const questionContentBase = z.object({
  format: questionFormatSchema,
  stem: z.string().trim().min(1, 'Question stem is required'),
  statements: z.array(statementSchema).max(6),
  choices: z.array(choiceSchema).min(2).max(5),
  answerKey: choiceKeySchema.nullable(),
  rationale: z.string(),
  mnemonic: z.string(),
  requiresImage: z.boolean(),
  flags: z.array(questionFlagSchema),
  status: questionStatusSchema,
  reviewNote: z.string(),
})

type ContentLike = Pick<
  z.infer<typeof questionContentBase>,
  'format' | 'statements' | 'choices' | 'answerKey' | 'status'
>

/** Cross-field rules shared by import, editor and server validation. */
export function refineQuestionContent(value: ContentLike, ctx: z.RefinementCtx) {
  value.choices.forEach((choice, index) => {
    if (choice.key !== CHOICE_KEYS[index]) {
      ctx.addIssue({
        code: 'custom',
        path: ['choices', index, 'key'],
        message: `Choice ${index + 1} must be labelled ${CHOICE_KEYS[index]}`,
      })
    }
  })
  if (value.answerKey === null) {
    if (value.status !== 'needs_review' && value.status !== 'archived') {
      ctx.addIssue({
        code: 'custom',
        path: ['answerKey'],
        message: 'Pick the correct answer (or mark the question as needs review)',
      })
    }
  } else if (!value.choices.some((c) => c.key === value.answerKey)) {
    ctx.addIssue({
      code: 'custom',
      path: ['answerKey'],
      message: 'The answer must be one of the choices',
    })
  }
  if (value.format === 'roman_combo' && value.statements.length < 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['statements'],
      message: 'Roman numeral questions need at least two statements',
    })
  }
  if (value.format === 'two_statement' && value.statements.length !== 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['statements'],
      message: 'Two-statement questions need exactly two statements',
    })
  }
}

export const SOURCE_REF_PATTERN = /^[a-z0-9]+(?::[a-z0-9-]+)+$/

export const questionImportImageSchema = z.object({
  /** Path relative to the data/images directory. */
  file: z.string().min(1),
  role: imageRoleSchema,
  choiceKey: choiceKeySchema.nullish(),
  alt: z.string().nullish(),
})

/** One question as produced by the extraction pipeline (data/questions/*.json). */
export const questionImportSchema = z
  .object({
    sourceRef: z.string().regex(SOURCE_REF_PATTERN),
    module: z.string().regex(/^m[1-6]$/),
    topicSlug: z.string().nullish(),
    ordinal: z.number().int().nonnegative(),
    printedNumber: z.string().nullish(),
    sourcePage: z.number().int().nullish(),
    groupKey: z.string().regex(SOURCE_REF_PATTERN).nullish(),
    groupOrder: z.number().int().nullish(),
    context: z.string().nullish(),
    format: questionFormatSchema,
    stem: z.string().trim().min(1),
    statements: z.array(statementSchema).max(6).default([]),
    choices: z.array(choiceSchema).min(2).max(5),
    answerKey: choiceKeySchema.nullable(),
    rationale: z.string().default(''),
    mnemonic: z.string().default(''),
    requiresImage: z.boolean().default(false),
    flags: z.array(questionFlagSchema).default([]),
    status: questionStatusSchema.default('auto'),
    reviewNote: z.string().default(''),
    images: z.array(questionImportImageSchema).default([]),
    duplicateOfRef: z.string().nullish(),
    raw: z
      .object({
        text: z.string().nullish(),
        answer: z.string().nullish(),
        rationale: z.string().nullish(),
      })
      .nullish(),
  })
  .superRefine(refineQuestionContent)

export const questionImportFileSchema = z.object({
  source: z.object({
    slug: z.string().regex(/^[a-z0-9]+$/),
    name: z.string().min(1),
    shortName: z.string().min(1),
  }),
  questions: z.array(questionImportSchema),
})

export type QuestionImport = z.infer<typeof questionImportSchema>
export type QuestionImportFile = z.infer<typeof questionImportFileSchema>

/** Admin editor payload. */
export const questionEditorSchema = questionContentBase
  .extend({
    moduleId: z.number().int().positive({ message: 'Pick a module' }),
    topicId: z.number().int().positive().nullable(),
    sourceId: z.number().int().positive({ message: 'Pick a source' }),
    groupId: z.number().int().positive().nullable(),
    groupOrder: z.number().int().nullable(),
  })
  .superRefine(refineQuestionContent)

export type QuestionEditorValues = z.infer<typeof questionEditorSchema>

export const updateQuestionSchema = z.object({
  id: z.number().int().positive(),
  values: questionEditorSchema,
})
