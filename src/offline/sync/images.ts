import { authHeaders } from '#/integrations/clerk/fresh-session'

import type { ManifestImage } from '../db'

/** Shared with the service worker (src/pwa/sw.template.js), which serves from it. */
export const IMAGE_CACHE = 'fq-images'
const CONCURRENCY = 4

const imageUrl = (id: number) => `/api/images/${id}`

async function fetchImage(id: number) {
  const first = await fetch(imageUrl(id), { credentials: 'same-origin' }).catch(() => null)
  if (first?.status !== 404) return first
  // A stale Clerk session looks like 404 here: retry once with a fresh token.
  return fetch(imageUrl(id), { credentials: 'same-origin', headers: await authHeaders({ force: true }) }).catch(
    () => null,
  )
}

/** Images already on this device, by id. */
export async function cachedImageIds() {
  if (typeof caches === 'undefined') return new Set<number>()
  const cache = await caches.open(IMAGE_CACHE)
  const ids = new Set<number>()
  for (const request of await cache.keys()) {
    const match = /\/api\/images\/(\d+)$/.exec(new URL(request.url).pathname)
    if (match) ids.add(Number(match[1]))
  }
  return ids
}

/**
 * Make Cache Storage hold exactly the manifest's images: download what's
 * missing (resumable, a few at a time) and drop what the server removed.
 */
export async function syncImages(list: ManifestImage[], onProgress: (done: number, total: number) => void) {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(IMAGE_CACHE)
  const have = await cachedImageIds()
  const wanted = new Set(list.map((i) => i.id))
  for (const id of have) if (!wanted.has(id)) await cache.delete(imageUrl(id))

  const missing = list.map((i) => i.id).filter((id) => !have.has(id))
  let done = list.length - missing.length
  onProgress(done, list.length)
  let next = 0
  const worker = async () => {
    while (next < missing.length && navigator.onLine) {
      const id = missing[next++]
      const response = await fetchImage(id)
      if (response?.status !== 200) continue
      await cache.put(imageUrl(id), response)
      done++
      onProgress(done, list.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}
