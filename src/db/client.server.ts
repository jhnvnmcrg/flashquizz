import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from './schema.ts'

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return drizzle(url, { schema, casing: 'snake_case' })
}

let db: ReturnType<typeof createDb> | undefined

/** Lazily created so the env var is read at call time, not import time. */
export function getDb() {
  db ??= createDb()
  return db
}

export type Db = ReturnType<typeof getDb>
