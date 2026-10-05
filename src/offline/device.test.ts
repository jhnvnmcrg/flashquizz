import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Images live in Cache Storage, which Node doesn't have.
vi.mock('./sync/images', () => ({ IMAGE_CACHE: 'fq-images' }))

const A = { userId: 'user_alice', isAdmin: true }
const B = { userId: 'user_bob', isAdmin: false }

/** The app starting again: freshly loaded modules (they cache open handles), same IndexedDB. */
async function restart() {
  vi.resetModules()
  return {
    ...(await import('./auth.ts')),
    ...(await import('./db.ts')),
    ...(await import('./device.ts')),
  }
}

/** A fresh device: empty IndexedDB. */
async function device() {
  globalThis.indexedDB = new IDBFactory()
  return restart()
}

type Device = Awaited<ReturnType<typeof device>>

/** What the guard does after a reload: open the leased copy. */
async function reopen() {
  const d = await restart()
  const lease = await d.readActiveLease()
  if (lease) await d.openLeasedCopy(lease)
  return d
}

/** An answer recorded offline and not uploaded yet. */
async function answerOffline(d: Device, id: string, questionId: number) {
  await (await d.openLocalDb()).put('attempts', {
    id,
    clientId: id,
    questionId,
    sessionId: null,
    mode: 'practice',
    selectedKey: 'A',
    selfGrade: null,
    isCorrect: true,
    responseMs: 800,
    answeredAt: new Date(),
    pending: 1,
  })
}

const pendingIds = async (d: Device) => (await (await d.openLocalDb()).getAll('attempts')).map((a) => a.id)

/** The single-copy database an older version of the app left behind. */
async function legacyCopy(owner: { userId: string; confirmedAt: Date } | null) {
  const db = await openDB('flashquizz', 1, {
    upgrade(db) {
      db.createObjectStore('meta')
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('pending', 'pending')
      attempts.createIndex('clientId', 'clientId')
    },
  })
  if (owner) await db.put('meta', owner, 'owner')
  await db.put('attempts', { id: 'old-answer', clientId: 'old-answer', questionId: 7, pending: 1 })
  db.close()
}

describe('one copy per person on a shared device', () => {
  let d: Device
  beforeEach(async () => {
    d = await device()
  })

  it('gives each person a database of their own', async () => {
    expect(await d.recordUser(A)).toBe(false)
    expect((await d.readActiveLease())?.dbName).toBe('flashquizz-user_alice')
    expect(d.userStore.state).toEqual(A)
    await answerOffline(d, 'a1', 1)

    // Bob signs in on the same device: Alice's copy closes, the page reloads into Bob's (empty) one.
    expect(await d.recordUser(B)).toBe(true)
    await expect(d.openLocalDb()).rejects.toThrow()
    d = await reopen()
    expect((await d.readActiveLease())?.dbName).toBe('flashquizz-user_bob')
    expect(d.userStore.state).toEqual(B)
    expect(await pendingIds(d)).toEqual([])
    await answerOffline(d, 'b1', 2)

    // Alice again: her copy and unsynced answer are still there.
    expect(await d.recordUser(A)).toBe(true)
    d = await reopen()
    expect(await pendingIds(d)).toEqual(['a1'])
  })

  it('opens the leased copy after a restart, offline', async () => {
    await d.recordUser(A)
    await answerOffline(d, 'a1', 1)
    await d.recordUser(B)
    d = await reopen()
    await answerOffline(d, 'b1', 2)

    const again = await restart()
    const lease = await again.readActiveLease()
    if (!lease) throw new Error('expected Bob’s lease')
    expect(lease).toMatchObject({ userId: B.userId, isAdmin: false })
    await again.openLeasedCopy(lease)
    expect(again.userStore.state).toEqual(B)
    expect(await pendingIds(again)).toEqual(['b1'])
  })

  it('stops opening a copy after 30 days without the server', async () => {
    await d.recordUser(A)
    const lease = await d.readLease()
    if (!lease) throw new Error('expected Alice’s lease')
    await d.writeLease({ ...lease, confirmedAt: new Date(Date.now() - 31 * 86_400_000) })
    expect(await d.readActiveLease()).toBeNull()
  })

  it('signing out removes only that person’s copy, and nothing reopens it', async () => {
    await d.recordUser(A)
    await answerOffline(d, 'a1', 1)
    await d.recordUser(B)
    d = await reopen()
    await answerOffline(d, 'b1', 2)
    await d.wipeLocalData()
    // A sync winding down tries to write after the wipe.
    await expect(d.setMeta('lastSync', { at: new Date(), ok: false, error: 'signed out' })).rejects.toThrow()

    expect(await d.readLease()).toBeUndefined()
    expect(d.userStore.state).toBeNull()
    const names = (await indexedDB.databases()).map((db) => db.name)
    expect(names).toContain('flashquizz-user_alice')
    expect(names).not.toContain('flashquizz-user_bob')
    expect(await d.recordUser(A)).toBe(false)
    expect(await pendingIds(d)).toEqual(['a1'])
  })

  it('keeps the old single copy as its owner’s, unsynced answers included', async () => {
    await legacyCopy({ userId: A.userId, confirmedAt: new Date() })
    const lease = await d.readActiveLease()
    expect(lease).toMatchObject({ userId: A.userId, dbName: 'flashquizz' })
    d = await reopen()
    expect(await pendingIds(d)).toEqual(['old-answer'])

    // Someone else gets a fresh copy; the old one is left alone.
    expect(await d.recordUser(B)).toBe(true)
    d = await reopen()
    expect(await pendingIds(d)).toEqual([])
    expect(await d.recordUser(A)).toBe(true)
    d = await reopen()
    expect(await pendingIds(d)).toEqual(['old-answer'])
  })

  it('gives an old copy with no owner recorded to the first admin, not to a member', async () => {
    await legacyCopy(null)
    expect(await d.readActiveLease()).toBeNull()
    await d.recordUser(B)
    expect(await pendingIds(d)).toEqual([])
    expect(await d.recordUser(A)).toBe(true)
    d = await reopen()
    expect((await d.readLease())?.dbName).toBe('flashquizz')
    expect(await pendingIds(d)).toEqual(['old-answer'])
  })

  it('leaves no stray database behind when there was no old copy', async () => {
    await d.recordUser(A)
    const names = (await indexedDB.databases()).map((db) => db.name)
    expect(names).not.toContain('flashquizz')
  })
})
