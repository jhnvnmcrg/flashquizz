import { inArray } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { questions } from '#/db/schema'
import type { QuestionAnswer, QuestionView } from '#/lib/question-view'
import type { ChoiceKey } from '#/lib/schemas/enums'

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
