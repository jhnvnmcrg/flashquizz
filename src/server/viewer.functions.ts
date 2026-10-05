import { createServerFn } from '@tanstack/react-start'

import { requireUser } from './auth'

/** Resolves for admins and invited members; anyone else is redirected by the middleware. */
export const getViewer = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .handler(({ context }) => ({ userId: context.userId, isAdmin: context.isAdmin }))
