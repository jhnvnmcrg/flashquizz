import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't boot Start/Nitro plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
