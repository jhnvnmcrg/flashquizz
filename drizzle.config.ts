import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  casing: 'snake_case',
  strict: true,
  dbCredentials: {
    // Migrations go over the direct (non-pooled) connection when available.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
})
