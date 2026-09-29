/**
 * Mark cross-source repeats as duplicates so each question is studied once.
 *
 *   npx tsx scripts/dedupe-questions.ts          # report only
 *   npx tsx scripts/dedupe-questions.ts --write  # set duplicateOfRef + flag in data/questions
 *
 * A pair counts as a repeat when stems and choices are near-identical, the
 * answers agree (same answer text), and the two are not members of the same
 * group. The copy with the weaker rationale (shorter) is marked; ties keep the
 * earlier source. Pairs whose answers disagree are listed for manual review.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { findNearDuplicates, listQuestionFiles, QUESTIONS_DIR, validateFiles, type LoadedQuestion } from './lib/question-files.ts'

const write = process.argv.includes('--write')
const { questions, errors } = validateFiles(listQuestionFiles())
if (errors.length) {
  console.error('Fix validation errors first (npm run questions:validate).')
  process.exit(1)
}

const answerText = (q: LoadedQuestion) =>
  (q.choices.find((c) => c.key === q.answerKey)?.text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const repeats: { keep: LoadedQuestion; drop: LoadedQuestion; score: number }[] = []
const conflicts: { a: LoadedQuestion; b: LoadedQuestion }[] = []

for (const { a, b, score } of findNearDuplicates(questions)) {
  if (a.groupKey && a.groupKey === b.groupKey) continue
  if (a.sourceSlug === b.sourceSlug && Math.abs(a.ordinal - b.ordinal) <= 4 && a.stem.trim() !== b.stem.trim()) continue
  if (!a.answerKey || !b.answerKey || answerText(a) !== answerText(b)) {
    conflicts.push({ a, b })
    continue
  }
  const weight = (q: LoadedQuestion) => q.rationale.length + q.mnemonic.length + (q.status === 'needs_review' ? -10_000 : 0)
  const [keep, drop] = weight(a) >= weight(b) ? [a, b] : [b, a]
  repeats.push({ keep, drop, score })
}

console.log(`Repeats (${repeats.length}):`)
for (const r of repeats) console.log(`  keep ${r.keep.sourceRef.padEnd(14)} drop ${r.drop.sourceRef}  (${r.score.toFixed(2)})`)
console.log(`\nLook-alikes with different answers — review by hand (${conflicts.length}):`)
for (const c of conflicts) console.log(`  ${c.a.sourceRef}  vs  ${c.b.sourceRef}   "${answerText(c.a)}" / "${answerText(c.b)}"`)

if (write) {
  const byFile = new Map<string, Map<string, string>>()
  for (const r of repeats) {
    if (r.drop.duplicateOfRef) continue
    const m = byFile.get(r.drop.file) ?? new Map<string, string>()
    m.set(r.drop.sourceRef, r.keep.sourceRef)
    byFile.set(r.drop.file, m)
  }
  for (const [file, refs] of byFile) {
    const path = join(QUESTIONS_DIR, file)
    const json = JSON.parse(readFileSync(path, 'utf8'))
    for (const q of json.questions) {
      const target = refs.get(q.sourceRef)
      if (!target) continue
      q.duplicateOfRef = target
      q.flags = Array.from(new Set([...(q.flags ?? []), 'duplicate']))
    }
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`)
  }
  console.log(`\nMarked ${[...byFile.values()].reduce((s, m) => s + m.size, 0)} duplicate(s).`)
}
