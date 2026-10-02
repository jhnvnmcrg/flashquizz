// FlashQuizz service worker (classic worker, plain JS).
// src/pwa/vite-plugin-sw.ts fills in VERSION and PRECACHE at build time and
// emits the result as /sw.js. Never served in `vite dev`.

const VERSION = '__FQ_VERSION__'
const PRECACHE = /*__FQ_PRECACHE__*/ []

const SHELL = '/_shell.html'
const PRECACHE_CACHE = `fq-precache-${VERSION}`
// Question images: kept across app updates, filled by the offline download.
const IMAGE_CACHE = 'fq-images'
const PRECACHED = new Set(PRECACHE)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE_CACHE)
      // `reload` skips the HTTP cache, so a new deploy's files arrive fresh.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  )
  // No skipWaiting here: the page decides when to switch (see src/pwa/register.ts).
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('fq-precache-') && name !== PRECACHE_CACHE) await caches.delete(name)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'VERSION') event.ports[0]?.postMessage(VERSION)
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Server functions and other origins (Clerk) always go straight to the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/_serverFn')) return

  if (request.mode === 'navigate') {
    // API documents and Clerk handshakes (__clerk_* params) go to the network untouched.
    if (url.pathname.startsWith('/api/') || [...url.searchParams.keys()].some((k) => k.startsWith('__clerk'))) return
    event.respondWith(appShell(request))
    return
  }
  if (url.pathname.startsWith('/api/images/')) {
    event.respondWith(questionImage(request))
    return
  }
  if (PRECACHED.has(url.pathname)) event.respondWith(precached(request))
})

/** Every page is the same app shell; the router renders the URL in the browser. */
async function appShell(request) {
  const cache = await caches.open(PRECACHE_CACHE)
  return (await cache.match(SHELL)) ?? fetch(request)
}

async function precached(request) {
  const cache = await caches.open(PRECACHE_CACHE)
  return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request)
}

/** An image's bytes never change for its id: cache-first, and keep only real 200s. */
async function questionImage(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true })
  if (hit) return hit
  const response = await fetch(request)
  if (response.status === 200 && response.type === 'basic') await cache.put(request, response.clone())
  return response
}
