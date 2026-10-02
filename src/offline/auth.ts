import { deleteLocalDb, getMeta, openLocalDb, setMeta } from './db'
import { resetLocalState } from './store'
import { IMAGE_CACHE } from './sync/images'

/** How long the device works offline after the server last confirmed the owner. */
export const OWNER_LEASE_DAYS = 30
const DAY_MS = 86_400_000

/** The owner record, if the server confirmed it recently enough to allow offline use. */
export async function readOwnerLease() {
  if (typeof indexedDB === 'undefined') return null
  const owner = await getMeta('owner')
  if (!owner) return null
  return Date.now() - owner.confirmedAt.getTime() < OWNER_LEASE_DAYS * DAY_MS ? owner : null
}

export async function recordOwner(userId: string) {
  await setMeta('owner', { userId, confirmedAt: new Date() })
}

/** Forget the owner (next visit needs an online sign-in) but keep the downloaded copy. */
export async function clearOwnerLease() {
  await (await openLocalDb()).delete('meta', 'owner')
}

/** Remove everything FlashQuizz keeps on this device: the local copy and cached images. */
export async function wipeLocalData() {
  await deleteLocalDb()
  if (typeof caches !== 'undefined') await caches.delete(IMAGE_CACHE)
  resetLocalState()
}
