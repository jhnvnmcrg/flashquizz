import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

import { ownerOnly } from './server/owner'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, clerkMiddleware()],
  // Fail closed: every server function, including future ones, is owner-only.
  functionMiddleware: [ownerOnly],
}))
