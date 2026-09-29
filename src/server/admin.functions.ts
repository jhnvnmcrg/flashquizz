import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/client.server'
import { attempts, modules, questionGroups, questionImages, questions, sources, topics } from '#/db/schema'
import { questionFlagSchema, questionStatusSchema } from '#/lib/schemas/enums'
import { questionEditorSchema, updateQuestionSchema } from '#/lib/schemas/question'

import { ownerOnly } from './owner'

const listFilterSchema = z.object({
  module: z.string().optional(),
  status: questionStatusSchema.optional(),
  source: z.string().optional(),
})

/** Light rows for the question bank table (no rationale, no image data). */
export const listAdminQuestions = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(listFilterSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const where: SQL[] = []
    if (data.module) where.push(eq(modules.slug, data.module))
    if (data.status) where.push(eq(questions.status, data.status))
    if (data.source) where.push(eq(sources.slug, data.source))
    return db
      .select({
        id: questions.id,
        sourceRef: questions.sourceRef,
        moduleSlug: modules.slug,
        moduleCode: modules.code,
        accentHue: modules.accentHue,
        topicId: questions.topicId,
        topic: topics.name,
        source: sources.shortName,
        format: questions.format,
        stem: questions.stem,
        choicesText: sql<string>`(select string_agg(c->>'text', ' | ') from jsonb_array_elements(${questions.choices}) c)`,
        answerKey: questions.answerKey,
        status: questions.status,
        flags: questions.flags,
        requiresImage: questions.requiresImage,
        imageCount: sql<number>`(select count(*)::int from question_images qi where qi.question_id = ${questions.id})`,
        duplicateOfRef: questions.duplicateOfRef,
        editedAt: questions.editedAt,
        ordinal: questions.ordinal,
      })
      .from(questions)
      .innerJoin(modules, eq(modules.id, questions.moduleId))
      .innerJoin(sources, eq(sources.id, questions.sourceId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(modules.sortOrder), asc(sources.sortOrder), asc(questions.ordinal))
  })

export const getAdminQuestion = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const db = getDb()
    const q = await db.query.questions.findFirst({
      where: eq(questions.id, data.id),
      with: {
        group: true,
        module: { columns: { slug: true, code: true, accentHue: true } },
        source: { columns: { slug: true, shortName: true, name: true } },
        progress: true,
        images: {
          columns: { id: true, role: true, choiceKey: true, alt: true, width: true, height: true, byteSize: true, sortOrder: true },
          orderBy: asc(questionImages.sortOrder),
        },
      },
    })
    if (!q) throw notFound()
    const [recent, siblings] = await Promise.all([
      db
        .select({
          selectedKey: attempts.selectedKey,
          isCorrect: attempts.isCorrect,
          mode: attempts.mode,
          answeredAt: attempts.answeredAt,
        })
        .from(attempts)
        .where(eq(attempts.questionId, data.id))
        .orderBy(desc(attempts.answeredAt))
        .limit(10),
      q.groupId
        ? db
            .select({ id: questions.id, sourceRef: questions.sourceRef, stem: questions.stem, groupOrder: questions.groupOrder })
            .from(questions)
            .where(eq(questions.groupId, q.groupId))
            .orderBy(asc(questions.groupOrder))
        : Promise.resolve([]),
    ])
    return { question: q, recentAttempts: recent, groupMembers: siblings }
  })

export const updateQuestion = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(updateQuestionSchema)
  .handler(async ({ data }) => {
    const v = data.values
    await getDb()
      .update(questions)
      .set({
        moduleId: v.moduleId,
        topicId: v.topicId,
        sourceId: v.sourceId,
        groupId: v.groupId,
        groupOrder: v.groupOrder,
        format: v.format,
        stem: v.stem,
        statements: v.statements,
        choices: v.choices,
        answerKey: v.answerKey,
        rationale: v.rationale,
        mnemonic: v.mnemonic,
        requiresImage: v.requiresImage,
        flags: v.flags,
        status: v.status,
        reviewNote: v.reviewNote,
        editedAt: new Date(),
      })
      .where(eq(questions.id, data.id))
    return { id: data.id }
  })

export const createQuestion = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(questionEditorSchema)
  .handler(async ({ data: v }) => {
    const db = getDb()
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${questions.ordinal}), 0)::int + 1` })
      .from(questions)
      .innerJoin(sources, eq(sources.id, questions.sourceId))
      .where(eq(sources.slug, 'manual'))
    const [row] = await db
      .insert(questions)
      .values({
        sourceRef: `manual:${String(next).padStart(4, '0')}`,
        ordinal: next,
        moduleId: v.moduleId,
        topicId: v.topicId,
        sourceId: v.sourceId,
        groupId: v.groupId,
        groupOrder: v.groupOrder,
        format: v.format,
        stem: v.stem,
        statements: v.statements,
        choices: v.choices,
        answerKey: v.answerKey,
        rationale: v.rationale,
        mnemonic: v.mnemonic,
        requiresImage: v.requiresImage,
        flags: v.flags,
        status: v.status,
        reviewNote: v.reviewNote,
        editedAt: new Date(),
      })
      .returning({ id: questions.id })
    return { id: row.id }
  })

export const setQuestionsStatus = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000), status: questionStatusSchema }))
  .handler(async ({ data }) => {
    await getDb()
      .update(questions)
      .set({ status: data.status, editedAt: new Date() })
      .where(inArray(questions.id, data.ids))
    return { updated: data.ids.length }
  })

export const getReviewQueue = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .validator(z.object({ flag: questionFlagSchema.optional() }))
  .handler(async ({ data }) => {
    const db = getDb()
    const where: SQL[] = [eq(questions.status, 'needs_review')]
    if (data.flag) where.push(sql`${data.flag} = any(${questions.flags})`)
    const [items, flagCounts] = await Promise.all([
      db
        .select({
          id: questions.id,
          sourceRef: questions.sourceRef,
          moduleCode: modules.code,
          accentHue: modules.accentHue,
          source: sources.shortName,
          stem: questions.stem,
          flags: questions.flags,
          reviewNote: questions.reviewNote,
        })
        .from(questions)
        .innerJoin(modules, eq(modules.id, questions.moduleId))
        .innerJoin(sources, eq(sources.id, questions.sourceId))
        .where(and(...where))
        .orderBy(asc(modules.sortOrder), asc(sources.sortOrder), asc(questions.ordinal)),
      db
        .select({ flag: sql<string>`unnest(${questions.flags})`, n: sql<number>`count(*)::int` })
        .from(questions)
        .where(eq(questions.status, 'needs_review'))
        .groupBy(sql`1`),
    ])
    return { items, flagCounts }
  })

export const saveGroupContext = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(z.object({ groupId: z.number().int().positive(), context: z.string().trim().min(1) }))
  .handler(async ({ data }) => {
    await getDb().update(questionGroups).set({ context: data.context }).where(eq(questionGroups.id, data.groupId))
    return { ok: true }
  })
