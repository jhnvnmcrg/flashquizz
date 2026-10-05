import { clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { accessFor } from '#/lib/access'

import { adminIds, forgetAccess, requireAdmin } from './auth'

/** Clerk's API errors carry the readable text in `errors[0].longMessage`. */
function clerkMessage(error: unknown) {
  const detail = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0]
  return detail?.longMessage ?? detail?.message ?? (error instanceof Error ? error.message : 'Clerk request failed')
}

async function viaClerk<T>(call: () => Promise<T>) {
  try {
    return await call()
  } catch (error) {
    throw new Error(clerkMessage(error))
  }
}

/** Everyone with an account, and invitations nobody has accepted yet. */
export const listPeople = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const clerk = clerkClient()
    const [users, invitations] = await viaClerk(() =>
      Promise.all([
        clerk.users.getUserList({ limit: 500, orderBy: '-created_at' }),
        clerk.invitations.getInvitationList({ status: 'pending', limit: 500 }),
      ]),
    )
    const admins = adminIds()
    return {
      people: users.data.map((u) => {
        const stored = (u.publicMetadata as { access?: unknown } | undefined)?.access
        return {
          id: u.id,
          name: u.fullName || u.username || null,
          email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null,
          lastActiveAt: u.lastActiveAt,
          access: accessFor(u.id, admins, stored),
          removed: stored === 'removed',
          isYou: u.id === context.userId,
        }
      }),
      invitations: invitations.data.map((i) => ({ id: i.id, email: i.emailAddress, createdAt: i.createdAt })),
    }
  })

/** Email an invitation; signing up from it gives member access. */
export const invitePerson = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(z.object({ email: z.email().max(254) }))
  .handler(async ({ data }) => {
    const origin = new URL(getRequest().url).origin
    await viaClerk(() =>
      clerkClient().invitations.createInvitation({
        emailAddress: data.email,
        redirectUrl: `${origin}/sign-up`,
        publicMetadata: { access: 'member' },
        notify: true,
      }),
    )
    return { ok: true }
  })

export const revokeInvitation = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(z.object({ id: z.string().startsWith('inv_').max(64) }))
  .handler(async ({ data }) => {
    await viaClerk(() => clerkClient().invitations.revokeInvitation(data.id))
    return { ok: true }
  })

/** Remove or restore someone's access. Their progress stays in the database either way. */
export const setAccess = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(z.object({ userId: z.string().startsWith('user_').max(64), access: z.enum(['member', 'removed']) }))
  .handler(async ({ data }) => {
    if (adminIds().includes(data.userId)) throw new Error('Admins are set in the environment (ADMIN_CLERK_USER_IDS).')
    await viaClerk(() => clerkClient().users.updateUserMetadata(data.userId, { publicMetadata: { access: data.access } }))
    forgetAccess(data.userId)
    return { ok: true }
  })
