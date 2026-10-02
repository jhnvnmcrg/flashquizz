import type { ChoiceKey, QuestionFormat } from './schemas/enums.ts'
import type { Choice, Statement } from './schemas/question.ts'

export type ImageMeta = {
  id: number
  role: 'stem' | 'choice' | 'rationale'
  choiceKey: string | null
  alt: string
  width: number | null
  height: number | null
}

/** What a study screen needs to render a question (answer optional). */
export type QuestionView = {
  id: number
  format: QuestionFormat
  stem: string
  statements: Statement[]
  choices: Choice[]
  context: string | null
  groupId: number | null
  groupOrder: number | null
  module: { slug: string; code: string; shortName: string; accentHue: number }
  topic: string | null
  source: string
  printedNumber: string | null
  images: ImageMeta[]
  bookmarked: boolean
}

export type QuestionAnswer = {
  answerKey: ChoiceKey
  rationale: string
  mnemonic: string
}
