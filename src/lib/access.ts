/** Who may use FlashQuizz: the admins named in the environment, and invited members. */
export type Access = 'admin' | 'member' | 'none'

/** Comma-separated Clerk user IDs (`ADMIN_CLERK_USER_IDS`, or the older `OWNER_CLERK_USER_IDS`). */
export function parseAdminIds(raw: string | undefined) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Admins always get in. Anyone else needs `publicMetadata.access === 'member'`,
 * which an invitation from the People page sets on sign-up. A Clerk account
 * without it (e.g. sign-up mode left open by mistake) gets nothing.
 */
export function accessFor(userId: string, adminIds: readonly string[], metadataAccess: unknown): Access {
  if (adminIds.includes(userId)) return 'admin'
  return metadataAccess === 'member' ? 'member' : 'none'
}
