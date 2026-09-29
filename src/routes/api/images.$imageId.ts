import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { getDb } from '#/db/client.server'
import { questionImages } from '#/db/schema'
import { ownerOnlyRequest } from '#/server/owner'

export const Route = createFileRoute('/api/images/$imageId')({
  server: {
    middleware: [ownerOnlyRequest],
    handlers: {
      GET: async ({ params, request }) => {
        const id = Number(params.imageId)
        if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 })
        const [img] = await getDb()
          .select({ data: questionImages.data, mime: questionImages.mime, sha256: questionImages.sha256 })
          .from(questionImages)
          .where(eq(questionImages.id, id))
        if (!img) return new Response('Not found', { status: 404 })
        const etag = `"${img.sha256}"`
        const headers = {
          'Content-Type': img.mime,
          'Cache-Control': 'private, max-age=31536000, immutable',
          ETag: etag,
        }
        if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
        return new Response(Buffer.from(img.data, 'base64'), { headers })
      },
    },
  },
})
