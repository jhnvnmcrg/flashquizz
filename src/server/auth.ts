import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

import { accessFor, parseAdminIds } from '#/lib/access'

type UserCheck = { ok: true; userId: string; isAdmin: boolean } | { ok: false; reason: 'signed-out' | 'forbidden' }

/** Read per call, so a redeploy/restart is the only way to change it. */
export const adminIds = () => parseAdminIds(process.env.ADMIN_CLERK_USER_IDS ?? process.env.OWNER_CLERK_USER_IDS)

// Members' access lives in Clerk metadata; cache it briefly so not every
// request costs a Clerk API call.
const ACCESS_CACHE_MS = 5 * 60_000
const accessCache = new Map<string, { access: unknown; at: number }>()

/** Forget a cached access decision (after the People page changes it). */
export function forgetAccess(userId: string) {
  accessCache.delete(userId)
}

async function metadataAccess(userId: string) {
  const hit = accessCache.get(userId)
  if (hit && Date.now() - hit.at < ACCESS_CACHE_MS) return hit.access
  const user = await clerkClient().users.getUser(userId)
  const access = (user.publicMetadata as { access?: unknown } | undefined)?.access
  accessCache.set(userId, { access, at: Date.now() })
  return access
}

async function resolveUser(): Promise<UserCheck> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'signed-out' }
  const admins = adminIds()
  if (admins.includes(userId)) return { ok: true, userId, isAdmin: true }
  const access = accessFor(userId, admins, await metadataAccess(userId))
  return access === 'member' ? { ok: true, userId, isAdmin: false } : { ok: false, reason: 'forbidden' }
}

/**
 * Server-function middleware: signed in, and an admin or invited member.
 * Puts `userId` and `isAdmin` on the context; every personal query is scoped
 * to that `userId`.
 */
export const requireUser = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await resolveUser()
  if (!user.ok) {
    throw redirect({ to: user.reason === 'signed-out' ? '/sign-in/$' : '/forbidden' })
  }
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('Vary', 'Cookie')
  return next({ context: { userId: user.userId, isAdmin: user.isAdmin } })
})

/** Question-bank editing and people management: admins only. */
export const requireAdmin = createMiddleware({ type: 'function' })
  .middleware([requireUser])
  .server(async ({ next, context }) => {
    if (!context.isAdmin) throw new Error('Only admins can do this.')
    return next()
  })

/** Request middleware for server routes (question images): 404 for anyone not allowed in. */
export const requireUserRequest = createMiddleware().server(async ({ next }) => {
  const user = await resolveUser()
  if (!user.ok) throw new Response('Not found', { status: 404 })
  return next({ context: { userId: user.userId } })
})
