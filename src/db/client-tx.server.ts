import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'

import * as schema from './schema.ts'

function createTxDb(pool: Pool) {
  return drizzle({ client: pool, schema, casing: 'snake_case' })
}

export type Tx = Parameters<Parameters<ReturnType<typeof createTxDb>['transaction']>[0]>[0]

/**
 * An interactive transaction (neon-http can't do these). Opens a short-lived
 * WebSocket pool for the call and always closes it — suits serverless.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const pool = new Pool({ connectionString: url })
  try {
    return await createTxDb(pool).transaction(fn)
  } finally {
    await pool.end()
  }
}
