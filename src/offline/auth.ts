import { createStore } from '@tanstack/store'

import { deleteLocalDb, selectedLocalDb, selectLocalDb } from './db'
import { copyFor, forgetCopy, type Lease, readLease, writeLease } from './device'
import { resetLocalState } from './store'
import { IMAGE_CACHE } from './sync/images'

/** How long the device works offline after the server last confirmed the person. */
export const LEASE_DAYS = 30
const DAY_MS = 86_400_000

export type DeviceUser = { userId: string; isAdmin: boolean }

/** Whose copy is open (read by the app shell; admins see the question bank). */
export const userStore = createStore<DeviceUser | null>(null)

/** The lease, if the server confirmed the person recently enough to allow offline use. */
export async function readActiveLease(): Promise<Lease | null> {
  if (typeof indexedDB === 'undefined') return null
  const lease = await readLease()
  if (!lease) return null
  return Date.now() - lease.confirmedAt.getTime() < LEASE_DAYS * DAY_MS ? lease : null
}

/** Open `lease`'s copy. */
export async function openLeasedCopy(lease: Lease) {
  await selectLocalDb(lease.dbName)
  userStore.setState(() => ({ userId: lease.userId, isAdmin: lease.isAdmin }))
}

/**
 * The server just confirmed who is signed in: renew their lease and open
 * their copy. Returns true when this page has someone else's copy open; that
 * copy is closed (and stays on the device) and the caller reloads into the
 * right one.
 */
export async function recordUser(viewer: DeviceUser) {
  const open = userStore.state
  const before = await readLease()
  const same = before?.userId === viewer.userId
  const dbName = same ? before.dbName : await copyFor(viewer.userId, viewer.isAdmin)
  const lease = { ...viewer, dbName, confirmedAt: new Date() }
  await writeLease(lease)
  if (open && open.userId !== viewer.userId) {
    await selectLocalDb(null)
    return true
  }
  if (!same) resetLocalState()
  await openLeasedCopy(lease)
  return false
}

/** Forget who's signed in (next visit needs an online sign-in) but keep the downloaded copies. */
export async function clearLease() {
  await writeLease(null)
  userStore.setState(() => null)
}

/**
 * Remove the open person's copy from this device, and the cached images too
 * once nobody else keeps a copy here.
 */
export async function wipeLocalData() {
  const lease = await readLease()
  const name = lease?.dbName ?? selectedLocalDb()
  // Close the copy first, so nothing still running (a sync winding down) can reopen it.
  await selectLocalDb(null)
  await clearLease()
  await deleteLocalDb(name)
  const others = lease ? await forgetCopy(lease.userId) : 0
  if (!others && typeof caches !== 'undefined') await caches.delete(IMAGE_CACHE)
  resetLocalState()
}
