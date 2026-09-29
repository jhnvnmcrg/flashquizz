/** Shared helpers for reading and validating data/questions/*.json. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { type QuestionImport, questionImportFileSchema } from '../../src/lib/schemas/question.ts'
import { taxonomyImportSchema } from '../../src/lib/schemas/taxonomy.ts'
import { taxonomy } from '../taxonomy.ts'

export const ROOT = resolve(import.meta.dirname, '..', '..')
export const QUESTIONS_DIR = join(ROOT, 'data', 'questions')
export const IMAGES_DIR = join(ROOT, 'data', 'images')

export type LoadedQuestion = QuestionImport & { file: string; sourceSlug: string }

export function listQuestionFiles(dir = QUESTIONS_DIR): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f))
}

/** Topic slug → module slug, from the committed taxonomy. */
export function topicModuleMap() {
  const parsed = taxonomyImportSchema.parse(taxonomy)
  const map = new Map<string, string>()
  for (const m of parsed.modules) {
    for (const s of m.subjects) for (const t of s.topics) map.set(t.slug, m.slug)
  }
  return map
}

export function validateFiles(files: string[], imagesDir = IMAGES_DIR) {
  const errors: string[] = []
  const questions: LoadedQuestion[] = []
  const sources = new Map<string, { name: string; shortName: string }>()
  const topicModules = topicModuleMap()

  for (const file of files) {
    const name = basename(file)
    let json: unknown
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push(`${name}: invalid JSON (${(e as Error).message})`)
      continue
    }
    const result = questionImportFileSchema.safeParse(json)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [, index] = issue.path
        const ref =
          typeof index === 'number'
            ? ((json as { questions?: { sourceRef?: string }[] }).questions?.[index]?.sourceRef ?? '?')
            : ''
        errors.push(`${name} ${issue.path.join('.')} ${ref ? `(${ref})` : ''}: ${issue.message}`)
      }
      continue
    }
    const { source } = result.data
    const known = sources.get(source.slug)
    if (known && (known.name !== source.name || known.shortName !== source.shortName)) {
      errors.push(`${name}: source "${source.slug}" header differs from another file`)
    }
    sources.set(source.slug, { name: source.name, shortName: source.shortName })

    for (const q of result.data.questions) {
      if (!q.sourceRef.startsWith(`${source.slug}:`)) {
        errors.push(`${name} ${q.sourceRef}: sourceRef must start with "${source.slug}:"`)
      }
      if (q.topicSlug) {
        const mod = topicModules.get(q.topicSlug)
        if (!mod) errors.push(`${name} ${q.sourceRef}: unknown topicSlug "${q.topicSlug}"`)
        else if (mod !== q.module)
          errors.push(`${name} ${q.sourceRef}: topic "${q.topicSlug}" belongs to ${mod}, not ${q.module}`)
      }
      for (const img of q.images) {
        if (!existsSync(join(imagesDir, img.file))) {
          errors.push(`${name} ${q.sourceRef}: image not found data/images/${img.file}`)
        }
        if (img.role === 'choice' && !img.choiceKey) {
          errors.push(`${name} ${q.sourceRef}: choice image needs choiceKey`)
        }
      }
      if (q.groupKey && !q.context?.trim()) {
        errors.push(`${name} ${q.sourceRef}: grouped question needs a context`)
      }
      questions.push({ ...q, file: name, sourceSlug: source.slug })
    }
  }

  const seen = new Map<string, string>()
  for (const q of questions) {
    const prev = seen.get(q.sourceRef)
    if (prev) errors.push(`${q.file} ${q.sourceRef}: duplicate sourceRef (also in ${prev})`)
    seen.set(q.sourceRef, q.file)
  }

  const groups = new Map<string, LoadedQuestion[]>()
  for (const q of questions) {
    if (!q.groupKey) continue
    const list = groups.get(q.groupKey) ?? []
    list.push(q)
    groups.set(q.groupKey, list)
  }
  for (const [key, members] of groups) {
    if (members.length < 2) errors.push(`group ${key}: only one member (${members[0].sourceRef})`)
    const contexts = new Set(members.map((m) => m.context?.trim()))
    if (contexts.size > 1) errors.push(`group ${key}: members have different context text`)
    const orders = members.map((m) => m.groupOrder)
    if (new Set(orders).size !== orders.length) errors.push(`group ${key}: duplicate groupOrder`)
  }

  const refs = new Set(questions.map((q) => q.sourceRef))
  for (const q of questions) {
    if (q.duplicateOfRef && !refs.has(q.duplicateOfRef) && files.length > 1) {
      errors.push(`${q.file} ${q.sourceRef}: duplicateOfRef "${q.duplicateOfRef}" not found`)
    }
  }

  return { errors, questions, sources }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function bigrams(s: string) {
  const out = new Set<string>()
  const words = normalize(s).split(' ')
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`)
  return out
}

function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/** Pairs whose stem AND choices are near-identical. */
export function findNearDuplicates(questions: LoadedQuestion[], threshold = 0.8) {
  const prepared = questions.map((q) => ({
    q,
    stem: bigrams(`${q.context ?? ''} ${q.stem} ${q.statements.map((s) => s.text).join(' ')}`),
    choices: new Set(q.choices.map((c) => normalize(c.text))),
  }))
  const pairs: { a: LoadedQuestion; b: LoadedQuestion; score: number }[] = []
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const x = prepared[i]
      const y = prepared[j]
      if (x.q.module !== y.q.module) continue
      const s = similarity(x.stem, y.stem)
      if (s < threshold) continue
      let shared = 0
      for (const c of x.choices) if (y.choices.has(c)) shared++
      if (shared / Math.max(x.choices.size, y.choices.size) < 0.75) continue
      pairs.push({ a: x.q, b: y.q, score: s })
    }
  }
  return pairs
}
