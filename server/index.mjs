import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stationMiddleware, preloadStations } from './stations.mjs'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const stations = stationMiddleware()
void preloadStations()
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }
const server = createServer((req, res) => stations(req, res, async () => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (!path.startsWith(resolve(root) + sep)) { res.statusCode = 403; res.end(); return }
    let data, file = path
    try { data = await readFile(path) }
    catch { if (!req.headers.accept?.includes('text/html') || pathname.startsWith('/api/')) { res.statusCode = 404; res.end(); return } file = resolve(root, 'index.html'); data = await readFile(file) }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    res.end(data)
  } catch { res.statusCode = 400; res.end('Unable to serve this request.') }
}))
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log('RoadSafe web and station API ready.'))
