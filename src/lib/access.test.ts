import { describe, expect, it } from 'vitest'

import { accessFor, parseAdminIds } from './access.ts'

describe('who may use FlashQuizz', () => {
  const admins = parseAdminIds(' user_owner , ,user_second ')

  it('reads the admin list from a comma-separated variable', () => {
    expect(admins).toEqual(['user_owner', 'user_second'])
    expect(parseAdminIds(undefined)).toEqual([])
  })

  it('lets admins in whatever their metadata says', () => {
    expect(accessFor('user_owner', admins, undefined)).toBe('admin')
    expect(accessFor('user_second', admins, 'removed')).toBe('admin')
  })

  it('lets invited members in', () => {
    expect(accessFor('user_friend', admins, 'member')).toBe('member')
  })

  it('keeps out removed people and accounts that were never invited', () => {
    expect(accessFor('user_friend', admins, 'removed')).toBe('none')
    expect(accessFor('user_stranger', admins, undefined)).toBe('none')
    expect(accessFor('user_stranger', admins, 'admin')).toBe('none')
    expect(accessFor('user_stranger', [], 'Member')).toBe('none')
  })
})
