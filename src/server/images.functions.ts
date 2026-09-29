import { createServerFn } from '@tanstack/react-start'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '#/db/client.server'
import { questionImages } from '#/db/schema'
import { choiceKeySchema, imageRoleSchema } from '#/lib/schemas/enums'

import { ownerOnly } from './owner'

const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

const uploadMetaSchema = z.object({
  questionId: z.coerce.number().int().positive(),
  role: imageRoleSchema,
  choiceKey: choiceKeySchema.nullable(),
  alt: z.string().max(300),
  width: z.coerce.number().int().positive().nullable(),
  height: z.coerce.number().int().positive().nullable(),
})

export const uploadQuestionImage = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error('Expected form data')
    const file = data.get('file')
    if (!(file instanceof File)) throw new Error('Choose an image to upload')
    if (!ALLOWED.has(file.type)) throw new Error('Use a PNG, JPEG or WebP image')
    if (file.size > MAX_BYTES) throw new Error('Images must be 2 MB or smaller')
    const meta = uploadMetaSchema.parse({
      questionId: data.get('questionId'),
      role: data.get('role'),
      choiceKey: data.get('choiceKey') || null,
      alt: data.get('alt') ?? '',
      width: data.get('width') || null,
      height: data.get('height') || null,
    })
    return { file, ...meta }
  })
  .handler(async ({ data }) => {
    const buf = Buffer.from(await data.file.arrayBuffer())
    const hash = await crypto.subtle.digest('SHA-256', buf)
    const sha256 = Buffer.from(hash).toString('hex')
    const db = getDb()
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${questionImages.sortOrder}), -1)::int + 1` })
      .from(questionImages)
      .where(eq(questionImages.questionId, data.questionId))
    const [row] = await db
      .insert(questionImages)
      .values({
        questionId: data.questionId,
        role: data.role,
        choiceKey: data.role === 'choice' ? data.choiceKey : null,
        alt: data.alt,
        mime: data.file.type,
        width: data.width,
        height: data.height,
        byteSize: buf.length,
        sha256,
        data: buf.toString('base64'),
        sortOrder: next,
      })
      .onConflictDoNothing()
      .returning({ id: questionImages.id })
    if (!row) throw new Error('This image is already attached to the question')
    return { id: row.id }
  })

export const updateQuestionImage = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(
    z.object({
      id: z.number().int().positive(),
      role: imageRoleSchema,
      choiceKey: choiceKeySchema.nullable(),
      alt: z.string().max(300),
    }),
  )
  .handler(async ({ data }) => {
    await getDb()
      .update(questionImages)
      .set({ role: data.role, choiceKey: data.role === 'choice' ? data.choiceKey : null, alt: data.alt })
      .where(eq(questionImages.id, data.id))
    return { ok: true }
  })

export const deleteQuestionImage = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    await getDb().delete(questionImages).where(eq(questionImages.id, data.id))
    return { ok: true }
  })
