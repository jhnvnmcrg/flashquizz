import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

import { serviceWorker } from './src/pwa/vite-plugin-sw'

// Always fetched fresh so a new deploy is noticed (the SW does the caching).
const noCache = { headers: { 'cache-control': 'no-cache' } }

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      // Run Vercel functions in Singapore, next to the Neon database
      // (ap-southeast-1). Written into the function's .vc-config.json.
      vercel: { functions: { regions: ['sin1'] } },
      routeRules: {
        '/sw.js': noCache,
        '/_shell.html': noCache,
        '/manifest.webmanifest': noCache,
      },
    }),
    tailwindcss(),
    // The prerendered /_shell.html is what the installed app serves for every
    // page. Build only: in dev, SPA mode would turn every request into a shell.
    tanstackStart({ spa: { enabled: command === 'build' } }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
    serviceWorker(),
  ],
}))

export default config
