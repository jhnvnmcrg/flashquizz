import type { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'

import { SYNC_PROTOCOL_MISMATCH } from '#/lib/schemas/sync'

import { countPending, setMeta } from '../db'
import { loadLocalState } from '../store'
import { syncImages } from './images'
import { pull } from './pull'
import { hasPending, push } from './push'
import { type SyncPhase, setSync } from './status'
import { serverTransport } from './transport'

// Only one tab syncs at a time (Web Locks); the others reload when it's done.
const LOCK = 'fq-sync'
const CHANNEL = 'fq-sync'
/** Background triggers (tab becomes visible) wait at least this long between full syncs. */
const MIN_GAP_MS = 2 * 60_000
/** Uploads after a local change wait this long, so a burst of answers goes up together. */
const PUSH_DELAY_MS = 2_500

let running: Promise<void> | null = null
let lastFinished = 0
let pushTimer: ReturnType<typeof setTimeout> | null = null
let queryClient: QueryClient | null = null
// Browser only: this module is also loaded on the server, where an open channel keeps Node alive.
const channel =
  typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)

/** Study screens read through TanStack Query: refresh them after the device copy changes. */
export function connectQueryClient(qc: QueryClient) {
  queryClient = qc
}

function refreshScreens() {
  void queryClient?.invalidateQueries({
    predicate: (q) => !['admin', 'viewer'].includes(String(q.queryKey[0])),
  })
}

async function afterLocalChange() {
  await loadLocalState()
  channel?.postMessage('changed')
  refreshScreens()
}

/** Called when another tab has refreshed the local copy. */
export function onRemoteChange(listener: () => void) {
  const handle = () => {
    listener()
    refreshScreens()
  }
  channel?.addEventListener('message', handle)
  return () => channel?.removeEventListener('message', handle)
}

export async function refreshPending() {
  const { total } = await countPending().catch(() => ({ total: 0 }))
  setSync({ pending: total })
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function classify(error: unknown): SyncPhase {
  if (isRedirect(error)) return 'signed-out'
  if (message(error).startsWith(SYNC_PROTOCOL_MISMATCH)) return 'update-required'
  if (!navigator.onLine || error instanceof TypeError) return 'offline'
  return 'error'
}

async function withLock(work: () => Promise<void>) {
  if (typeof navigator.locks?.request !== 'function') return work()
  await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
    if (lock) await work()
  })
}

async function fail(error: unknown) {
  const phase = classify(error)
  setSync({ phase, step: null, error: phase === 'error' ? message(error) : null })
  await setMeta('lastSync', { at: new Date(), ok: false, error: message(error) }).catch(() => undefined)
}

/** Full sync: upload local changes, download what changed, then images. */
async function runSync() {
  void refreshPending()
  if (!navigator.onLine) {
    setSync({ phase: 'offline' })
    return
  }
  await withLock(async () => {
    setSync({ phase: 'syncing', step: null, done: 0, total: 0, error: null })
    try {
      const pushed = (await hasPending()) ? await push(serverTransport) : { sent: 0, refused: 0 }
      const result = await pull(serverTransport, (p) => setSync({ step: p.step, done: p.done, total: p.total }))
      if (pushed.sent || result.changed) await afterLocalChange()
      const at = new Date()
      await setMeta('lastSync', { at, ok: true, error: null })
      await refreshPending()
      setSync({ step: 'images' })
      await syncImages(result.images, (done, total) => setSync({ images: { done, total } }))
      setSync({ phase: navigator.onLine ? 'idle' : 'offline', step: null, lastSyncedAt: at })
    } catch (error) {
      await fail(error)
    }
  })
}

/** Upload only (after answers and bookmarks); downloads wait for the next full sync. */
async function runPush() {
  await refreshPending()
  if (!navigator.onLine) {
    setSync({ phase: 'offline' })
    return
  }
  if (running) {
    // A full sync is under way; it may have read the queue already, so go again after it.
    void running.then(() => requestPush())
    return
  }
  await withLock(async () => {
    try {
      if (!(await hasPending())) return
      const pushed = await push(serverTransport)
      if (pushed.sent) await afterLocalChange()
      await refreshPending()
      setSync({ phase: 'idle', error: null, lastSyncedAt: new Date() })
    } catch (error) {
      await fail(error)
    }
  })
}

/** Ask for a full sync. Overlapping requests share one run; `force` ignores the minimum gap. */
export function requestSync({ force = false } = {}) {
  if (running) return running
  if (!force && Date.now() - lastFinished < MIN_GAP_MS) return Promise.resolve()
  running = runSync().finally(() => {
    running = null
    lastFinished = Date.now()
  })
  return running
}

/** Queue an upload shortly after a local change (answers in a burst go up together). */
export function requestPush() {
  void refreshPending()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void runPush()
  }, PUSH_DELAY_MS)
}
