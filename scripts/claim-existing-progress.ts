/**
 * For the move to invited users (migration 0002): progress, sessions, answers
 * and bookmarks recorded before rows had an owner belong to the first admin.
 * Until migration 0003 makes the column required, it also makes that admin the
 * column default, so rows the previous deployment still writes are theirs too.
 * Safe to run again; it only touches rows without an owner.
 *
 * Usage: npx tsx scripts/claim-existing-progress.ts [--user <clerk user id>]
 */
import { config } from 'dotenv'
import { sql } from 'drizzle-orm'

config({ path: '.env', quiet: true })

const { getDb } = await import('../src/db/client.server.ts')
const { parseAdminIds } = await import('../src/lib/access.ts')

const flag = process.argv.indexOf('--user')
const userId =
  flag >= 0
    ? process.argv[flag + 1]
    : parseAdminIds(process.env.ADMIN_CLERK_USER_IDS ?? process.env.OWNER_CLERK_USER_IDS)[0]
// Clerk user IDs are `user_` plus letters and digits; anything else is a typo.
if (!userId || !/^user_[A-Za-z0-9]+$/.test(userId)) {
  console.error('Needs a Clerk user ID: set ADMIN_CLERK_USER_IDS (or OWNER_CLERK_USER_IDS) in .env, or pass --user.')
  process.exit(1)
}

const TABLES = ['question_progress', 'study_sessions', 'attempts', 'bookmark_events']
const db = getDb()
type Result = { rows: Record<string, unknown>[]; rowCount: number | null }

for (const table of TABLES) {
  const name = sql.identifier(table)
  const claimed = (await db.execute(sql`update ${name} set user_id = ${userId} where user_id is null`)) as unknown as Result
  const column = (await db.execute(sql`
    select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = 'user_id'`)) as unknown as Result
  const nullable = column.rows[0]?.is_nullable === 'YES'
  // A default can't be a bind parameter; the ID was checked above.
  if (nullable) await db.execute(sql`alter table ${name} alter column user_id set default ${sql.raw(`'${userId}'`)}`)
  console.log(`${table}: claimed ${claimed.rowCount ?? 0} rows${nullable ? ' (new rows default to this user until 0003)' : ''}`)
}
