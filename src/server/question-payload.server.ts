import { inArray } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { questions } from '#/db/schema'
import type { ChoiceKey, QuestionFormat } from '#/lib/schemas/enums'
import type { Choice, Statement } from '#/lib/schemas/question'

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

/** Load display payloads for many questions at once (keyed by id). */
export async function loadQuestionViews(ids: number[], withAnswers: boolean) {
  const out = new Map<number, QuestionView & Partial<QuestionAnswer>>()
  if (!ids.length) return out
  const db = getDb()
  const rows = await db.query.questions.findMany({
    where: inArray(questions.id, ids),
    columns: {
      id: true,
      format: true,
      stem: true,
      statements: true,
      choices: true,
      groupId: true,
      groupOrder: true,
      printedNumber: true,
      answerKey: true,
      rationale: true,
      mnemonic: true,
    },
    with: {
      group: { columns: { context: true } },
      module: { columns: { slug: true, code: true, shortName: true, accentHue: true } },
      topic: { columns: { name: true } },
      source: { columns: { shortName: true } },
      progress: { columns: { bookmarked: true } },
      images: {
        columns: { id: true, role: true, choiceKey: true, alt: true, width: true, height: true, sortOrder: true },
      },
    },
  })
  for (const r of rows) {
    const view: QuestionView & Partial<QuestionAnswer> = {
      id: r.id,
      format: r.format,
      stem: r.stem,
      statements: r.statements,
      choices: r.choices,
      context: r.group?.context || null,
      groupId: r.groupId,
      groupOrder: r.groupOrder,
      module: r.module,
      topic: r.topic?.name ?? null,
      source: r.source.shortName,
      printedNumber: r.printedNumber,
      images: r.images
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ sortOrder: _s, ...img }) => img),
      bookmarked: r.progress?.bookmarked ?? false,
    }
    if (withAnswers) {
      view.answerKey = r.answerKey as ChoiceKey
      view.rationale = r.rationale
      view.mnemonic = r.mnemonic
    }
    out.set(r.id, view)
  }
  return out
}
