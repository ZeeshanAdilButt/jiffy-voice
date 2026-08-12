/**
 * A static server for the browser example, in about forty lines, because
 * ES modules cannot be loaded over file:// and adding a dev-server
 * dependency to look at one HTML page is a poor trade.
 *
 * Run with: make example-browser
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PORT = Number(process.env.PORT ?? 5173)

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)
  const pathname = url.pathname === '/' ? '/examples/browser/' : url.pathname
  const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname
  const path = join(ROOT, normalize(requested).replace(/^(\.\.[/\\])+/, ''))

  if (!path.startsWith(ROOT)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  readFile(path)
    .then((body) => {
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      })
      response.end(body)
    })
    .catch(() => {
      response.writeHead(404).end('Not found')
    })
})

server.listen(PORT, () => {
  console.log(`open http://localhost:${PORT}/examples/browser/`)
})
