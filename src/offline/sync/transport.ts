import { SYNC_PROTOCOL } from '#/lib/schemas/sync'
import {
  getAttemptsSince,
  getProgressSince,
  getSessionsSince,
  getSyncManifest,
  getSyncQuestions,
  pushChanges,
} from '#/server/sync.functions'

import type { SyncTransport } from './pull'

/** The real server, over the owner-only sync server functions. */
export const serverTransport: SyncTransport = {
  manifest: (contentHash) => getSyncManifest({ data: { protocol: SYNC_PROTOCOL, contentHash } }),
  questions: (ids) => getSyncQuestions({ data: { protocol: SYNC_PROTOCOL, ids } }),
  progressSince: (since, after) => getProgressSince({ data: { protocol: SYNC_PROTOCOL, since, after } }),
  sessionsSince: (since, after) => getSessionsSince({ data: { protocol: SYNC_PROTOCOL, since, after } }),
  attemptsSince: (since, after) => getAttemptsSince({ data: { protocol: SYNC_PROTOCOL, since, after } }),
  push: (changes) => pushChanges({ data: { protocol: SYNC_PROTOCOL, ...changes } }),
}
