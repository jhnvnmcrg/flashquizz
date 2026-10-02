import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import type { Plugin } from 'vite'

const TEMPLATE = resolve(import.meta.dirname, 'sw.template.js')

/** Files under public/ — Nitro copies these, so they aren't in the client bundle. */
function publicFiles(dir: string) {
  const out: { url: string; path: string }[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else out.push({ url: `/${relative(dir, path).split('\\').join('/')}`, path })
    }
  }
  walk(dir)
  return out
}

/**
 * Emits /sw.js during the client build with a precache list of every client
 * file, the public/ files and the SPA shell (prerendered later by Start).
 * vite-plugin-pwa and @serwist/vite don't emit in Start production builds,
 * so this follows Start's own manifest plugin: client environment, generateBundle.
 */
export function serviceWorker({ publicDir = 'public' }: { publicDir?: string } = {}): Plugin {
  return {
    name: 'flashquizz:service-worker',
    apply: 'build',
    enforce: 'post',
    applyToEnvironment: (env) => env.name === 'client',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const template = readFileSync(TEMPLATE, 'utf8')
      hash.update(template)

      // Bundle file names already carry content hashes.
      const files = new Set(
        Object.keys(bundle)
          .filter((f) => !f.endsWith('.map') && !f.startsWith('.vite/'))
          .map((f) => `/${f}`),
      )
      for (const file of publicFiles(resolve(publicDir))) {
        if (file.url === '/robots.txt') continue
        files.add(file.url)
        hash.update(file.url).update(readFileSync(file.path))
      }
      files.add('/_shell.html')

      const precache = [...files].sort()
      hash.update(precache.join('\n'))
      const version = hash.digest('hex').slice(0, 12)
      const source = template
        .replace("'__FQ_VERSION__'", JSON.stringify(version))
        .replace('/*__FQ_PRECACHE__*/ []', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
