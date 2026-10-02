import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/client.server'
import { modules, questions, sources, subjects, topics } from '#/db/schema'
import {
  deleteTopicSchema,
  reorderSchema,
  saveModuleSchema,
  saveSubjectSchema,
  saveTopicSchema,
} from '#/lib/schemas/taxonomy'
import { emptyTally } from '#/lib/tally'

import { ownerOnly } from './owner'
import { topicTallies } from './stats.server'
import { loadTaxonomy } from './taxonomy.server'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

export const getTaxonomy = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(() => loadTaxonomy())

export const getModuleOverview = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb()
    const mod = await db.query.modules.findFirst({
      where: eq(modules.slug, data.slug),
      with: {
        subjects: {
          orderBy: asc(subjects.sortOrder),
          with: { topics: { orderBy: asc(topics.sortOrder), columns: { id: true, name: true } } },
        },
      },
    })
    if (!mod) throw notFound()
    const [tallies, srcs] = await Promise.all([
      topicTallies(),
      db
        .select({ slug: sources.slug, shortName: sources.shortName, n: sql<number>`count(*)::int` })
        .from(questions)
        .innerJoin(sources, eq(sources.id, questions.sourceId))
        .where(eq(questions.moduleId, mod.id))
        .groupBy(sources.slug, sources.shortName, sources.sortOrder)
        .orderBy(asc(sources.sortOrder)),
    ])
    return {
      module: {
        id: mod.id,
        slug: mod.slug,
        code: mod.code,
        name: mod.name,
        shortName: mod.shortName,
        description: mod.description,
        accentHue: mod.accentHue,
      },
      tally: tallies.byModule.get(mod.id) ?? emptyTally(),
      subjects: mod.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        topics: s.topics.map((t) => ({ id: t.id, name: t.name, tally: tallies.byTopic.get(t.id) ?? emptyTally() })),
      })),
      sources: srcs,
    }
  })

export const saveModule = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(saveModuleSchema)
  .handler(async ({ data }) => {
    const { id, ...values } = data
    await getDb().update(modules).set(values).where(eq(modules.id, id))
    return { ok: true }
  })

export const saveSubject = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(saveSubjectSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    if (data.id) {
      await db.update(subjects).set({ name: data.name }).where(eq(subjects.id, data.id))
      return { id: data.id }
    }
    const [mod] = await db.select({ slug: modules.slug }).from(modules).where(eq(modules.id, data.moduleId))
    const [row] = await db
      .insert(subjects)
      .values({
        moduleId: data.moduleId,
        name: data.name,
        slug: `${mod.slug}-${slugify(data.name)}-${Date.now().toString(36)}`,
        sortOrder: 999,
      })
      .returning({ id: subjects.id })
    return { id: row.id }
  })

export const saveTopic = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(saveTopicSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    if (data.id) {
      await db.update(topics).set({ name: data.name, subjectId: data.subjectId }).where(eq(topics.id, data.id))
      return { id: data.id }
    }
    const [row] = await db
      .insert(topics)
      .values({
        subjectId: data.subjectId,
        name: data.name,
        slug: `${slugify(data.name)}-${Date.now().toString(36)}`,
        sortOrder: 999,
      })
      .returning({ id: topics.id })
    return { id: row.id }
  })

export const deleteTopic = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(deleteTopicSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    await db.batch([
      db.update(questions).set({ topicId: data.reassignTo }).where(eq(questions.topicId, data.id)),
      db.delete(topics).where(eq(topics.id, data.id)),
    ])
    return { ok: true }
  })

export const reorderTaxonomy = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(reorderSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const table = data.kind === 'subject' ? subjects : topics
    const cases = sql.join(
      data.ids.map((id, i) => sql`when ${id} then ${i}`),
      sql` `,
    )
    await db
      .update(table)
      .set({ sortOrder: sql`case ${table.id} ${cases} end` })
      .where(inArray(table.id, data.ids))
    return { ok: true }
  })
