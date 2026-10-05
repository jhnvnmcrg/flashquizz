import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

import { freshSession } from './integrations/clerk/fresh-session'
import { requireUser } from './server/auth'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

// Start prerenders the offline app shell (/_shell.html) at build time. Skip
// Clerk there so the shell doesn't bake in a signed-out session.
const prerendering = typeof process !== 'undefined' && process.env.TSS_PRERENDERING === 'true'

export const startInstance = createStart(() => ({
  // Everything renders in the browser: the installed app serves the same
  // shell for every page, and study data will come from the device.
  defaultSsr: false,
  requestMiddleware: prerendering ? [csrfMiddleware] : [csrfMiddleware, clerkMiddleware()],
  // Fail closed: every server function, including future ones, needs a signed-in
  // admin or invited member (admin-only functions add requireAdmin).
  functionMiddleware: [freshSession, requireUser],
}))
