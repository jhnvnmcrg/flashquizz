import { isRedirect } from '@tanstack/react-router'

import { SYNC_PROTOCOL_MISMATCH } from '#/lib/schemas/sync'

import { setMeta } from '../db'
import { loadLocalState } from '../store'
import { syncImages } from './images'
import { pull } from './pull'
import { type SyncPhase, setSync } from './status'
import { serverTransport } from './transport'

// Only one tab syncs at a time (Web Locks); the others reload when it's done.
const LOCK = 'fq-sync'
const CHANNEL = 'fq-sync'
/** Background triggers (tab becomes visible) wait at least this long between runs. */
const MIN_GAP_MS = 2 * 60_000

let running: Promise<void> | null = null
let lastFinished = 0
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)

/** Ask for a sync. Overlapping requests share one run; `force` ignores the minimum gap. */
export function requestSync({ force = false } = {}) {
  if (running) return running
  if (!force && Date.now() - lastFinished < MIN_GAP_MS) return Promise.resolve()
  running = runSync().finally(() => {
    running = null
    lastFinished = Date.now()
  })
  return running
}

/** Called when another tab has refreshed the local copy. */
export function onRemoteChange(listener: () => void) {
  const handle = () => listener()
  channel?.addEventListener('message', handle)
  return () => channel?.removeEventListener('message', handle)
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

function classify(error: unknown): SyncPhase {
  if (isRedirect(error)) return 'signed-out'
  if (message(error).startsWith(SYNC_PROTOCOL_MISMATCH)) return 'update-required'
  if (!navigator.onLine || error instanceof TypeError) return 'offline'
  return 'error'
}

async function runSync() {
  if (!navigator.onLine) {
    setSync({ phase: 'offline' })
    return
  }
  const work = async () => {
    setSync({ phase: 'syncing', step: null, done: 0, total: 0, error: null })
    try {
      const result = await pull(serverTransport, (p) => setSync({ step: p.step, done: p.done, total: p.total }))
      if (result.changed) {
        await loadLocalState()
        channel?.postMessage('changed')
      }
      const at = new Date()
      await setMeta('lastSync', { at, ok: true, error: null })
      setSync({ step: 'images' })
      await syncImages(result.images, (done, total) => setSync({ images: { done, total } }))
      setSync({ phase: navigator.onLine ? 'idle' : 'offline', step: null, lastSyncedAt: at })
    } catch (error) {
      const phase = classify(error)
      setSync({ phase, step: null, error: phase === 'error' ? message(error) : null })
      await setMeta('lastSync', { at: new Date(), ok: false, error: message(error) }).catch(() => undefined)
    }
  }
  if (typeof navigator.locks?.request === 'function') {
    await navigator.locks.request(LOCK, { ifAvailable: true }, async (lock) => {
      if (lock) await work()
    })
  } else {
    await work()
  }
}
