import { createServerFn } from '@tanstack/react-start'

import {
  pushChangesInput,
  SYNC_PROTOCOL,
  SYNC_PROTOCOL_MISMATCH,
  syncManifestInput,
  syncQuestionsInput,
  syncSinceInput,
} from '#/lib/schemas/sync'

import { ownerOnly } from './owner'
import {
  applyPush,
  attemptsSince,
  loadManifest,
  loadSyncQuestions,
  progressSince,
  sessionsSince,
} from './sync.server'

/** An installed app older (or newer) than the server must update before syncing. */
function checkProtocol(protocol: number) {
  if (protocol !== SYNC_PROTOCOL) {
    throw new Error(`${SYNC_PROTOCOL_MISMATCH}: app speaks ${protocol}, server speaks ${SYNC_PROTOCOL}`)
  }
}

export const getSyncManifest = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(syncManifestInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return loadManifest(data.contentHash ?? null)
  })

export const getSyncQuestions = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(syncQuestionsInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return loadSyncQuestions(data.ids)
  })

export const getProgressSince = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(syncSinceInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return progressSince(data.since, data.after)
  })

export const getSessionsSince = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(syncSinceInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return sessionsSince(data.since, data.after)
  })

export const getAttemptsSince = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(syncSinceInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return attemptsSince(data.since, data.after)
  })

export const pushChanges = createServerFn({ method: 'POST' })
  .middleware([ownerOnly])
  .validator(pushChangesInput)
  .handler(({ data }) => {
    checkProtocol(data.protocol)
    return applyPush(data)
  })
