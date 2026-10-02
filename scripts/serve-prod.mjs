/**
 * Run the production build locally the way Vercel serves it, for testing the
 * installed/offline app. Nitro's node server can't serve /_shell.html (Start
 * writes it after Nitro builds its file list; Vercel serves it from disk), so
 * this serves the shell itself and proxies everything else to Nitro.
 *
 * Usage: npm run build && node scripts/serve-prod.mjs   (PORT defaults to 4173)
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'

const PORT = Number(process.env.PORT ?? 4173)
const UPSTREAM = PORT + 1
const SHELL = new URL('../.output/public/_shell.html', import.meta.url)

// Locally the secrets live in .env (on Vercel they're project env vars).
const nitro = spawn(process.execPath, ['--env-file-if-exists=.env', '.output/server/index.mjs'], {
  env: { ...process.env, PORT: String(UPSTREAM) },
  stdio: 'inherit',
})

http
  .createServer((req, res) => {
    if (req.url === '/_shell.html' || req.url?.startsWith('/_shell.html?')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
      res.end(readFileSync(SHELL))
      return
    }
    const upstream = http.request(
      { host: '127.0.0.1', port: UPSTREAM, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', () => {
      res.writeHead(502)
      res.end('Production server not ready yet')
    })
    req.pipe(upstream)
  })
  .listen(PORT, () => console.log(`FlashQuizz production build on http://localhost:${PORT}`))

const stop = () => {
  nitro.kill()
  process.exit()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
