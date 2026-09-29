/**
 * Validate extracted question files.
 *
 *   npx tsx scripts/validate-questions.ts                 # every data/questions/*.json
 *   npx tsx scripts/validate-questions.ts <file.json> ... # specific files
 *   npx tsx scripts/validate-questions.ts --dupes         # also report near-duplicates
 *
 * Exits non-zero when any file has errors.
 */
import { resolve } from 'node:path'

import { findNearDuplicates, listQuestionFiles, validateFiles } from './lib/question-files.ts'

function countBy<T>(items: T[], key: (item: T) => string) {
  const out: Record<string, number> = {}
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1
  return out
}

function main() {
  const args = process.argv.slice(2)
  const dupes = args.includes('--dupes')
  const paths = args.filter((a) => !a.startsWith('--')).map((p) => resolve(p))
  const files = paths.length ? paths : listQuestionFiles()
  if (!files.length) {
    console.log('No question files found in data/questions.')
    return
  }

  const { errors, questions } = validateFiles(files)

  console.log(`Files: ${files.length}   Questions: ${questions.length}`)
  console.log('By module:', countBy(questions, (q) => q.module))
  console.log('By status:', countBy(questions, (q) => q.status))
  const flags = countBy(
    questions.flatMap((q) => q.flags),
    (f) => f,
  )
  console.log('Flags:', flags)
  console.log('Missing topic:', questions.filter((q) => !q.topicSlug).length)
  console.log('By topic:')
  for (const [topic, n] of Object.entries(countBy(questions, (q) => q.topicSlug ?? '(none)')).sort()) {
    console.log(`  ${topic.padEnd(28)} ${n}`)
  }

  if (dupes) {
    const pairs = findNearDuplicates(questions)
    console.log(`\nNear-duplicates (${pairs.length}):`)
    for (const p of pairs) console.log(`  ${p.a.sourceRef}  ~  ${p.b.sourceRef}  (${p.score.toFixed(2)})`)
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s):`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ All files valid')
  }
}

main()
