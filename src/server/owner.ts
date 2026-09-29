import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

type OwnerCheck = { ok: true; userId: string } | { ok: false; reason: 'signed-out' | 'forbidden' }

/**
 * FlashQuizz is single-owner. Only Clerk users listed in OWNER_CLERK_USER_IDS
 * (comma-separated) get through; an empty list denies everyone (fail closed).
 * The env var is read per call so a redeploy/restart is the only way to change it.
 */
async function resolveOwner(): Promise<OwnerCheck> {
  const { userId } = await auth()
  if (!userId) return { ok: false, reason: 'signed-out' }
  const owners = (process.env.OWNER_CLERK_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!owners.includes(userId)) return { ok: false, reason: 'forbidden' }
  return { ok: true, userId }
}

/** Server-function middleware: every RPC must come from the owner. */
export const ownerOnly = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const owner = await resolveOwner()
  if (!owner.ok) {
    throw redirect({ to: owner.reason === 'signed-out' ? '/sign-in/$' : '/forbidden' })
  }
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('Vary', 'Cookie')
  return next({ context: { ownerId: owner.userId } })
})

/** Request middleware for server routes (images): 404 for anyone else. */
export const ownerOnlyRequest = createMiddleware().server(async ({ next }) => {
  const owner = await resolveOwner()
  if (!owner.ok) throw new Response('Not found', { status: 404 })
  return next({ context: { ownerId: owner.userId } })
})
