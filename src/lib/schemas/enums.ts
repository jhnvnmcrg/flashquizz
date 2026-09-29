import { z } from 'zod'

export const CHOICE_KEYS = ['A', 'B', 'C', 'D', 'E'] as const
export const QUESTION_STATUS = [
  'auto',
  'verified',
  'needs_review',
  'archived',
] as const
export const QUESTION_FORMAT = [
  'single',
  'except',
  'roman_combo',
  'two_statement',
  'matching',
  'computation',
] as const
export const IMAGE_ROLE = ['stem', 'choice', 'rationale'] as const
export const SESSION_MODE = ['flashcards', 'practice', 'review', 'exam'] as const
export const SESSION_STATUS = ['active', 'completed', 'abandoned'] as const
export const STUDY_SCOPE = [
  'all',
  'unseen',
  'mistakes',
  'bookmarked',
  'due',
] as const
export const STUDY_ORDER = ['smart', 'random', 'sequential'] as const
export const QUESTION_FLAGS = [
  'answer_text_conflict',
  'answer_missing',
  'answer_not_in_choices',
  'multiple_answers',
  'image_required',
  'strikethrough_suspect',
  'ocr_uncertain',
  'placeholder',
  'duplicate',
  'rationale_missing',
  'answer_disputed',
  'rationale_disputed',
  'ai_answer',
  'ai_choices',
] as const
export const STATEMENT_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const

export const choiceKeySchema = z.enum(CHOICE_KEYS)
export const questionStatusSchema = z.enum(QUESTION_STATUS)
export const questionFormatSchema = z.enum(QUESTION_FORMAT)
export const imageRoleSchema = z.enum(IMAGE_ROLE)
export const sessionModeSchema = z.enum(SESSION_MODE)
export const sessionStatusSchema = z.enum(SESSION_STATUS)
export const studyScopeSchema = z.enum(STUDY_SCOPE)
export const studyOrderSchema = z.enum(STUDY_ORDER)
export const questionFlagSchema = z.enum(QUESTION_FLAGS)
export const statementLabelSchema = z.enum(STATEMENT_LABELS)

export type ChoiceKey = z.infer<typeof choiceKeySchema>
export type QuestionStatus = z.infer<typeof questionStatusSchema>
export type QuestionFormat = z.infer<typeof questionFormatSchema>
export type ImageRole = z.infer<typeof imageRoleSchema>
export type SessionMode = z.infer<typeof sessionModeSchema>
export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type StudyScope = z.infer<typeof studyScopeSchema>
export type StudyOrder = z.infer<typeof studyOrderSchema>
export type QuestionFlag = z.infer<typeof questionFlagSchema>

export const FLAG_LABELS: Record<QuestionFlag, string> = {
  answer_text_conflict: 'Answer letter and text disagree',
  answer_missing: 'Answer missing',
  answer_not_in_choices: 'Answer not among choices',
  multiple_answers: 'Multiple answers given',
  image_required: 'Needs an image',
  strikethrough_suspect: 'Possible strikethrough correction',
  ocr_uncertain: 'Uncertain transcription',
  placeholder: 'Placeholder answer',
  duplicate: 'Duplicate of another question',
  rationale_missing: 'Rationale missing',
  answer_disputed: 'Answer may be wrong',
  rationale_disputed: 'Rationale may contain an error',
  ai_answer: 'Answer worked out by Claude',
  ai_choices: 'Choices written by Claude',
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  auto: 'Imported',
  verified: 'Verified',
  needs_review: 'Needs review',
  archived: 'Archived',
}

export const FORMAT_LABELS: Record<QuestionFormat, string> = {
  single: 'Single best answer',
  except: 'Except / Not',
  roman_combo: 'Roman numeral combo',
  two_statement: 'Two statements',
  matching: 'Matching set',
  computation: 'Computation',
}
