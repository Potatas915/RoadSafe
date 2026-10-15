// Copies MapLibre's worker file into /public so Vite can serve it as a normal file.
import { cpSync, mkdirSync, existsSync } from 'node:fs'

const src = 'node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js'
if (existsSync(src)) {
  mkdirSync('public', { recursive: true })
  cpSync(src, 'public/maplibre-gl-csp-worker.js')
  console.log('Copied maplibre-gl-csp-worker.js to /public')
}
