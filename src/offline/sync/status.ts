import { createStore } from '@tanstack/store'

import type { PullStep } from './pull'

/**
 * - `syncing`: talking to the server now
 * - `offline`: no connection; changes wait on the device
 * - `signed-out`: the server needs a fresh sign-in before it accepts changes
 * - `update-required`: this installed version is too old for the server
 * - `error`: the last sync failed for another reason (see `error`)
 */
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'update-required' | 'error'

export type SyncStatus = {
  phase: SyncPhase
  step: PullStep | 'images' | null
  done: number
  total: number
  images: { done: number; total: number }
  lastSyncedAt: Date | null
  error: string | null
}

export const syncStore = createStore<SyncStatus>({
  phase: 'idle',
  step: null,
  done: 0,
  total: 0,
  images: { done: 0, total: 0 },
  lastSyncedAt: null,
  error: null,
})

export function setSync(patch: Partial<SyncStatus>) {
  syncStore.setState((s) => ({ ...s, ...patch }))
}
