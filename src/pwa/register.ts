import { createStore } from '@tanstack/store'

/** Chrome/Edge/Android's install prompt (not in lib.dom). */
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/**
 * - `updateReady`: a new version is installed and waiting for the user to switch
 * - `installPrompt`: the browser offered to install the app (Chromium only)
 */
export const pwaStore = createStore<{ updateReady: boolean; installPrompt: InstallPromptEvent | null }>({
  updateReady: false,
  installPrompt: null,
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    pwaStore.setState((s) => ({ ...s, installPrompt: event as InstallPromptEvent }))
  })
  window.addEventListener('appinstalled', () => pwaStore.setState((s) => ({ ...s, installPrompt: null })))
}

/** Show the browser's install dialog, when it offered one. */
export async function promptInstall() {
  const event = pwaStore.state.installPrompt
  if (!event) return
  await event.prompt()
  await event.userChoice.catch(() => undefined)
  pwaStore.setState((s) => ({ ...s, installPrompt: null }))
}

/** The running service worker's build version, or null (dev, or not installed yet). */
export async function getAppVersion(): Promise<string | null> {
  const worker = (await navigator.serviceWorker?.getRegistration())?.active
  if (!worker) return null
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => resolve(typeof event.data === 'string' ? event.data : null)
    worker.postMessage({ type: 'VERSION' }, [channel.port2])
    setTimeout(() => resolve(null), 2000)
  })
}

// Switching right after launch is safe: nothing is in progress yet.
const LAUNCH_WINDOW_MS = 5_000

let waiting: ServiceWorker | null = null
let switching = false

/** Activate the waiting version; the page reloads once it takes control. */
export function applyUpdate() {
  if (!waiting) return
  switching = true
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

/** Register /sw.js (production only) and watch for new versions. */
export async function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const bootedAt = Date.now()

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first install also takes control; only reload for a switch we asked for.
    if (switching) window.location.reload()
  })

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  const onWaiting = (worker: ServiceWorker) => {
    waiting = worker
    if (Date.now() - bootedAt < LAUNCH_WINDOW_MS) applyUpdate()
    else pwaStore.setState((s) => ({ ...s, updateReady: true }))
  }
  if (registration.waiting && navigator.serviceWorker.controller) onWaiting(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) onWaiting(worker)
    })
  })

  const check = () => registration.update().catch(() => undefined)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, 60 * 60_000)
}
