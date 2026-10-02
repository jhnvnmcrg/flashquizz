import { getToken } from '@clerk/tanstack-react-start'
import { createMiddleware } from '@tanstack/react-start'

/** Clerk's `__session` cookie lives about a minute; true while one is still good. */
function sessionCookieFresh(marginMs = 10_000) {
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=')
    const name = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (!name.startsWith('__session') || !value) continue
    try {
      const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + marginMs) return true
    } catch {
      // not a JWT — ignore
    }
  }
  return false
}

/**
 * Pages come from the service worker, so no document request refreshes Clerk's
 * session cookie when the app launches or resumes (iOS suspends clerk-js).
 * When the cookie is stale, wait for clerk-js and send a fresh token instead.
 */
async function freshToken({ force = false } = {}) {
  if (typeof window === 'undefined' || !navigator.onLine || (!force && sessionCookieFresh())) return null
  try {
    return await getToken()
  } catch {
    // Clerk didn't load (offline or blocked): let the server decide.
    return null
  }
}

/** Headers for a plain fetch to an owner-only route (e.g. images). `force` skips the cookie check. */
export async function authHeaders(opts: { force?: boolean } = {}): Promise<Record<string, string>> {
  const token = await freshToken(opts)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Client half of every server function call. Registered globally in src/start.ts. */
export const freshSession = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const token = await freshToken()
  return token ? next({ headers: { Authorization: `Bearer ${token}` } }) : next()
})
