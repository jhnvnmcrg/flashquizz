/**
 * Seed the taxonomy and question bank.
 *
 *   npm run db:seed                                  # data/questions/*.json
 *   npm run db:seed -- --dir scripts/fixtures        # the sample fixture
 *   npm run db:seed -- --dry-run                     # validate + report only
 *   npm run db:seed -- --force                       # overwrite admin edits too
 *
 * Idempotent: rows are upserted by slug / key / sourceRef. Questions edited in
 * the admin (edited_at set) are left alone unless --force is passed.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

import { config } from 'dotenv'
import { and, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import type { PgTable } from 'drizzle-orm/pg-core'

import * as schema from '../src/db/schema.ts'
import { taxonomyImportSchema } from '../src/lib/schemas/taxonomy.ts'
import { IMAGES_DIR, listQuestionFiles, ROOT, validateFiles } from './lib/question-files.ts'
import { taxonomy } from './taxonomy.ts'

config({ path: join(ROOT, '.env'), quiet: true })

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const dryRun = flag('dry-run')
const force = flag('force')
const dir = resolve(option('dir') ?? join(ROOT, 'data', 'questions'))
const imagesDir = resolve(option('images') ?? IMAGES_DIR)

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** `SET col = excluded.col` for every listed column key. */
function excludedSet<T extends PgTable>(table: T, keys: (keyof T['_']['columns'] & string)[]) {
  const columns = getTableColumns(table)
  return Object.fromEntries(
    keys.map((key) => {
      if (!(key in columns)) throw new Error(`Unknown column ${key}`)
      return [key, sql.raw(`excluded."${toSnake(key)}"`)]
    }),
  )
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** Width/height from PNG or JPEG headers (no extra dependency). */
function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length) {
      if (buf[i] !== 0xff) break
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return null
}

async function main() {
  const files = listQuestionFiles(dir)
  console.log(`Reading ${files.length} question file(s) from ${dir}`)
  const { errors, questions, sources } = validateFiles(files, imagesDir)
  if (errors.length) {
    console.error(`${errors.length} validation error(s) — nothing written:`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    process.exit(1)
  }
  const tax = taxonomyImportSchema.parse(taxonomy)
  console.log(`Valid: ${questions.length} questions from ${sources.size} source(s)`)
  if (dryRun) {
    console.log('Dry run — no changes made.')
    return
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = drizzle(url, { schema, casing: 'snake_case' })
  const {
    modules,
    subjects,
    topics,
    sources: sourcesTable,
    questionGroups,
    questions: questionsTable,
    questionImages,
  } = schema

  // ── Taxonomy ──────────────────────────────────────────────────────────────
  await db
    .insert(modules)
    .values(
      tax.modules.map((m, i) => ({
        slug: m.slug,
        code: m.code,
        name: m.name,
        shortName: m.shortName,
        description: m.description,
        accentHue: m.accentHue,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: modules.slug })
  const moduleIds = new Map(
    (await db.select({ id: modules.id, slug: modules.slug }).from(modules)).map((r) => [r.slug, r.id]),
  )

  const subjectRows = tax.modules.flatMap((m) =>
    m.subjects.map((s, i) => ({
      moduleId: moduleIds.get(m.slug)!,
      slug: s.slug,
      name: s.name,
      sortOrder: i,
    })),
  )
  await db.insert(subjects).values(subjectRows).onConflictDoNothing({ target: subjects.slug })
  const subjectIds = new Map(
    (await db.select({ id: subjects.id, slug: subjects.slug }).from(subjects)).map((r) => [r.slug, r.id]),
  )

  const topicRows = tax.modules.flatMap((m) =>
    m.subjects.flatMap((s) =>
      s.topics.map((t, i) => ({
        subjectId: subjectIds.get(s.slug)!,
        slug: t.slug,
        name: t.name,
        sortOrder: i,
      })),
    ),
  )
  await db.insert(topics).values(topicRows).onConflictDoNothing({ target: topics.slug })
  const topicIds = new Map(
    (await db.select({ id: topics.id, slug: topics.slug }).from(topics)).map((r) => [r.slug, r.id]),
  )

  const sourceRows = new Map(tax.sources.map((s, i) => [s.slug, { ...s, sortOrder: i }]))
  for (const [slug, s] of sources) {
    if (!sourceRows.has(slug)) sourceRows.set(slug, { slug, ...s, sortOrder: sourceRows.size })
  }
  await db
    .insert(sourcesTable)
    .values([...sourceRows.values()])
    .onConflictDoUpdate({
      target: sourcesTable.slug,
      set: excludedSet(sourcesTable, ['name', 'shortName']),
    })
  const sourceIds = new Map(
    (await db.select({ id: sourcesTable.id, slug: sourcesTable.slug }).from(sourcesTable)).map((r) => [
      r.slug,
      r.id,
    ]),
  )
  console.log(
    `Taxonomy: ${moduleIds.size} modules, ${subjectIds.size} subjects, ${topicIds.size} topics, ${sourceIds.size} sources`,
  )

  // ── Groups ────────────────────────────────────────────────────────────────
  const groupRows = new Map<string, typeof questionGroups.$inferInsert>()
  for (const q of questions) {
    if (!q.groupKey || groupRows.has(q.groupKey)) continue
    groupRows.set(q.groupKey, {
      key: q.groupKey,
      sourceId: sourceIds.get(q.sourceSlug)!,
      moduleId: moduleIds.get(q.module)!,
      context: q.context?.trim() ?? '',
    })
  }
  if (groupRows.size) {
    await db
      .insert(questionGroups)
      .values([...groupRows.values()])
      .onConflictDoUpdate({
        target: questionGroups.key,
        set: excludedSet(questionGroups, ['context', 'moduleId', 'sourceId']),
      })
  }
  const groupIds = new Map(
    (await db.select({ id: questionGroups.id, key: questionGroups.key }).from(questionGroups)).map((r) => [
      r.key,
      r.id,
    ]),
  )

  // ── Questions ─────────────────────────────────────────────────────────────
  const rows = questions.map((q) => ({
    sourceRef: q.sourceRef,
    sourceId: sourceIds.get(q.sourceSlug)!,
    moduleId: moduleIds.get(q.module)!,
    topicId: q.topicSlug ? (topicIds.get(q.topicSlug) ?? null) : null,
    groupId: q.groupKey ? groupIds.get(q.groupKey)! : null,
    groupOrder: q.groupOrder ?? null,
    ordinal: q.ordinal,
    printedNumber: q.printedNumber ?? null,
    sourcePage: q.sourcePage ?? null,
    format: q.format,
    stem: q.stem,
    statements: q.statements,
    choices: q.choices,
    answerKey: q.answerKey,
    rationale: q.rationale,
    mnemonic: q.mnemonic,
    status: q.status,
    flags: q.flags,
    requiresImage: q.requiresImage,
    duplicateOfRef: q.duplicateOfRef ?? null,
    reviewNote: q.reviewNote,
    raw: q.raw ?? null,
  }))
  const updatable = [
    'sourceId',
    'moduleId',
    'topicId',
    'groupId',
    'groupOrder',
    'ordinal',
    'printedNumber',
    'sourcePage',
    'format',
    'stem',
    'statements',
    'choices',
    'answerKey',
    'rationale',
    'mnemonic',
    'status',
    'flags',
    'requiresImage',
    'duplicateOfRef',
    'reviewNote',
    'raw',
  ] as const
  for (const part of chunk(rows, 100)) {
    await db
      .insert(questionsTable)
      .values(part)
      .onConflictDoUpdate({
        target: questionsTable.sourceRef,
        set: { ...excludedSet(questionsTable, [...updatable]), updatedAt: sql`now()` },
        setWhere: force ? undefined : isNull(questionsTable.editedAt),
      })
  }
  const refs = questions.map((q) => q.sourceRef)
  const idByRef = new Map<string, number>()
  for (const part of chunk(refs, 500)) {
    const found = await db
      .select({ id: questionsTable.id, ref: questionsTable.sourceRef })
      .from(questionsTable)
      .where(inArray(questionsTable.sourceRef, part))
    for (const r of found) idByRef.set(r.ref, r.id)
  }

  // ── Images ────────────────────────────────────────────────────────────────
  let imageCount = 0
  for (const q of questions) {
    const questionId = idByRef.get(q.sourceRef)!
    for (const [i, img] of q.images.entries()) {
      const buf = readFileSync(join(imagesDir, img.file))
      const sha256 = createHash('sha256').update(buf).digest('hex')
      const size = imageSize(buf)
      const inserted = await db
        .insert(questionImages)
        .values({
          questionId,
          role: img.role,
          choiceKey: img.choiceKey ?? null,
          alt: img.alt ?? '',
          mime: MIME[extname(img.file).toLowerCase()] ?? 'application/octet-stream',
          width: size?.width ?? null,
          height: size?.height ?? null,
          byteSize: buf.length,
          sha256,
          data: buf.toString('base64'),
          sortOrder: i,
        })
        .onConflictDoNothing()
        .returning({ id: questionImages.id })
      imageCount += inserted.length
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const byModule = await db
    .select({ module: modules.code, status: questionsTable.status, n: sql<number>`count(*)::int` })
    .from(questionsTable)
    .innerJoin(modules, eq(modules.id, questionsTable.moduleId))
    .groupBy(modules.code, questionsTable.status)
    .orderBy(modules.code)
  const edited = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(questionsTable)
    .where(and(inArray(questionsTable.sourceRef, refs.slice(0, 30000)), sql`${questionsTable.editedAt} IS NOT NULL`))
  console.log(`Upserted ${rows.length} questions, ${imageCount} new image(s).`)
  if (!force && edited[0]?.n) console.log(`Kept ${edited[0].n} admin-edited question(s) unchanged.`)
  console.table(byModule)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
