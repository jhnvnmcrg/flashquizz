import { createServerFn } from '@tanstack/react-start'

import { ownerOnly } from './owner'

/** Resolves only for the owner; anyone else is redirected by the middleware. */
export const getViewer = createServerFn({ method: 'GET' })
  .middleware([ownerOnly])
  .handler(({ context }) => ({ userId: context.ownerId }))
