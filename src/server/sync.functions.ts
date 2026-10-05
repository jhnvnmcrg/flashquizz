import { createServerFn } from '@tanstack/react-start'

import {
  pushChangesInput,
  SYNC_PROTOCOL,
  SYNC_PROTOCOL_MISMATCH,
  SYNC_WRONG_USER,
  syncManifestInput,
  syncQuestionsInput,
  syncSinceInput,
} from '#/lib/schemas/sync'

import { requireUser } from './auth'
import {
  applyPush,
  attemptsSince,
  loadManifest,
  loadSyncQuestions,
  progressSince,
  sessionsSince,
} from './sync.server'

/**
 * An installed app older (or newer) than the server must update before
 * syncing, and a device copy only syncs with the account it belongs to.
 */
function checkCaller(data: { protocol: number; userId?: string }, context: { userId: string }) {
  if (data.protocol !== SYNC_PROTOCOL) {
    throw new Error(`${SYNC_PROTOCOL_MISMATCH}: app speaks ${data.protocol}, server speaks ${SYNC_PROTOCOL}`)
  }
  if (data.userId !== context.userId) throw new Error(`${SYNC_WRONG_USER}: this device copy belongs to another account`)
}

export const getSyncManifest = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(syncManifestInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return loadManifest(context.userId, context.isAdmin, data.contentHash ?? null)
  })

export const getSyncQuestions = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(syncQuestionsInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return loadSyncQuestions(data.ids)
  })

export const getProgressSince = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(syncSinceInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return progressSince(context.userId, data.since, data.after)
  })

export const getSessionsSince = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(syncSinceInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return sessionsSince(context.userId, data.since, data.after)
  })

export const getAttemptsSince = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(syncSinceInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return attemptsSince(context.userId, data.since, data.after)
  })

export const pushChanges = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(pushChangesInput)
  .handler(({ data, context }) => {
    checkCaller(data, context)
    return applyPush(context.userId, data)
  })
