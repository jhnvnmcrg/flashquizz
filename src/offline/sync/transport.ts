import { SYNC_PROTOCOL } from '#/lib/schemas/sync'
import {
  getAttemptsSince,
  getProgressSince,
  getSessionsSince,
  getSyncManifest,
  getSyncQuestions,
  pushChanges,
} from '#/server/sync.functions'

import { userStore } from '../auth'
import type { SyncTransport } from './pull'

/** Every call names whose copy this is; the server refuses if another account is signed in. */
const caller = () => ({ protocol: SYNC_PROTOCOL, userId: userStore.state?.userId })

/** The real server, over the sync server functions. */
export const serverTransport: SyncTransport = {
  manifest: (contentHash) => getSyncManifest({ data: { ...caller(), contentHash } }),
  questions: (ids) => getSyncQuestions({ data: { ...caller(), ids } }),
  progressSince: (since, after) => getProgressSince({ data: { ...caller(), since, after } }),
  sessionsSince: (since, after) => getSessionsSince({ data: { ...caller(), since, after } }),
  attemptsSince: (since, after) => getAttemptsSince({ data: { ...caller(), since, after } }),
  push: (changes) => pushChanges({ data: { ...caller(), ...changes } }),
}
