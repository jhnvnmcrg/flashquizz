import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from 'idb'

/**
 * Which person's copy this device opens. Everyone who signs in here gets a
 * database of their own; this small one records whose copy is open and which
 * copies exist, so two people sharing a device never see or upload each
 * other's progress.
 */
const DEVICE_DB = 'flashquizz-device'

/** The one copy a device kept before FlashQuizz had invited users; it stays its owner's. */
export const LEGACY_DB_NAME = 'flashquizz'

export const dbNameFor = (userId: string) => `flashquizz-${userId}`

export type Lease = {
  userId: string
  isAdmin: boolean
  /** The database holding this person's copy. */
  dbName: string
  /** Last time the server confirmed this person may use FlashQuizz. */
  confirmedAt: Date
}

type DeviceMeta = {
  lease: Lease
  /** Copies on this device: user ID → database name. */
  copies: Record<string, string>
  /** Set once the legacy copy has been looked at; `unowned` while nobody has claimed it. */
  legacy: { unowned: boolean }
}

interface DeviceDB extends DBSchema {
  meta: { key: keyof DeviceMeta; value: DeviceMeta[keyof DeviceMeta] }
}

let opening: Promise<IDBPDatabase<DeviceDB>> | null = null

function openDeviceDb() {
  opening ??= openDB<DeviceDB>(DEVICE_DB, 1, {
    upgrade(db) {
      db.createObjectStore('meta')
    },
  })
  return opening
}

async function get<K extends keyof DeviceMeta>(key: K) {
  return (await (await openDeviceDb()).get('meta', key)) as DeviceMeta[K] | undefined
}

async function put<K extends keyof DeviceMeta>(key: K, value: DeviceMeta[K] | null) {
  const db = await openDeviceDb()
  if (value === null) await db.delete('meta', key)
  else await db.put('meta', value, key)
}

/**
 * Before invitations, a device held one copy (`flashquizz`) with its owner in
 * `meta.owner`. It stays where it is and becomes that person's copy, unsynced
 * answers included. A copy whose owner was forgotten waits for the first
 * admin who signs in (only owners could ever create one).
 */
async function checkLegacyCopy() {
  if (await get('legacy')) return
  let created = false
  const db = await openDB(LEGACY_DB_NAME, undefined, {
    upgrade() {
      created = true
    },
  })
  const owner =
    !created && db.objectStoreNames.contains('meta')
      ? ((await db.get('meta', 'owner')) as { userId: string; confirmedAt: Date } | undefined)
      : undefined
  db.close()
  if (created) await deleteDB(LEGACY_DB_NAME)
  if (owner) {
    await put('copies', { ...(await get('copies')), [owner.userId]: LEGACY_DB_NAME })
    await put('lease', { userId: owner.userId, isAdmin: true, dbName: LEGACY_DB_NAME, confirmedAt: owner.confirmedAt })
  }
  await put('legacy', { unowned: !created && !owner })
}

/** Whose copy the device opens, however long ago the server confirmed them. */
export async function readLease() {
  await checkLegacyCopy()
  return get('lease')
}

export async function writeLease(lease: Lease | null) {
  await put('lease', lease)
}

/** The database for this person's copy, registering it on first use. */
export async function copyFor(userId: string, isAdmin: boolean) {
  await checkLegacyCopy()
  const copies = (await get('copies')) ?? {}
  if (copies[userId]) return copies[userId]
  const legacy = await get('legacy')
  const dbName = isAdmin && legacy?.unowned ? LEGACY_DB_NAME : dbNameFor(userId)
  if (dbName === LEGACY_DB_NAME) await put('legacy', { unowned: false })
  await put('copies', { ...copies, [userId]: dbName })
  return dbName
}

/** Forget a person's copy (after deleting it). Returns how many copies remain. */
export async function forgetCopy(userId: string) {
  const { [userId]: _gone, ...rest } = (await get('copies')) ?? {}
  await put('copies', rest)
  return Object.keys(rest).length
}
