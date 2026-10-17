import { readFile, mkdir, writeFile } from 'node:fs/promises'

const providers = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter']
const selectors = { police: ['["amenity"="police"]'], medical: ['["amenity"~"^(hospital|clinic)$"]', '["emergency"="ambulance_station"]'] }
const cache = new Map()

export function stationQuery(type, bounds, scope = 'area') {
  if (!Object.hasOwn(selectors, type)) throw new Error('Invalid station type.')
  if (scope === 'philippines') return `[out:json][timeout:50];area["ISO3166-1"="PH"]["admin_level"="2"]->.country;(${selectors[type].map((selector) => `nwr${selector}(area.country);`).join('')});out center tags;`
  if (scope !== 'area') throw new Error('Invalid station scope.')
  if (!Object.hasOwn(selectors, type) || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('Invalid station search.')
  const [south, west, north, east] = bounds
  if (south < -85 || north > 85 || west < -180 || east > 180 || north <= south || east <= west || north - south > 1.2 || east - west > 1.2) throw new Error('Invalid station search area.')
  return `[out:json][timeout:15];(${selectors[type].map((selector) => `nwr${selector}(${bounds.join(',')});`).join('')});out center tags;`
}

export async function fetchStationArea(type, bounds, request = fetch, scope = 'area') {
  const query = stationQuery(type, bounds, scope)
  const errors = []
  for (const endpoint of providers) {
    try {
      const response = await request(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `RoadSafe-AWA/1.0 (+${process.env.ROADSAFE_PUBLIC_URL || 'http://localhost:5173'})` },
        body: new URLSearchParams({ data: query }).toString(), signal: AbortSignal.timeout(scope === 'philippines' ? 60000 : 20000),
      })
      if (!response.ok) { errors.push(`${new URL(endpoint).hostname}: HTTP ${response.status}`); continue }
      const data = await response.json()
      if (data.remark || !Array.isArray(data.elements)) { errors.push(`${new URL(endpoint).hostname}: incomplete response`); continue }
      if (scope === 'philippines' && data.elements.length === 0) { errors.push(`${new URL(endpoint).hostname}: country dataset unavailable`); continue }
      return { elements: data.elements }
    } catch (error) { errors.push(`${new URL(endpoint).hostname}: ${error.name === 'TimeoutError' ? 'timed out' : 'unreachable'}`) }
  }
  throw new Error(`Station data providers are temporarily unavailable (${errors.join('; ')}). Please retry shortly. Previously cached areas remain available.`)
}

export async function nationwideStations(type, request, snapshotIO) {
  const file = new URL(`../.cache/stations/${type}-philippines.json`, import.meta.url)
  let saved
  try { saved = snapshotIO ? await snapshotIO.read() : JSON.parse(await readFile(file, 'utf8')); if (!Number.isFinite(saved.savedAt) || !Array.isArray(saved.elements) || saved.elements.length === 0) saved = null } catch { /* First download has no snapshot. */ }
  if (saved && Date.now() - saved.savedAt < 7 * 86400000) return { elements: saved.elements }
  try {
    const data = await fetchStationArea(type, null, request, 'philippines')
    try {
      const snapshot = { ...data, savedAt: Date.now() }
      if (snapshotIO) await snapshotIO.write(snapshot)
      else { await mkdir(new URL('../.cache/stations/', import.meta.url), { recursive: true }); await writeFile(file, JSON.stringify(snapshot)) }
    } catch { /* Read-only hosting can still use memory caching. */ }
    return data
  } catch (error) {
    if (saved) return { elements: saved.elements, warning: `Using saved station geography from ${new Date(saved.savedAt).toISOString().slice(0, 10)} while the live provider is unavailable.` }
    throw error
  }
}

export function stationMiddleware(request = fetch) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/api/stations') return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); res.end(JSON.stringify({ error: 'Use GET for station searches.' })); return }
    const type = url.searchParams.get('type')
    const scope = url.searchParams.get('scope') || 'area'
    const text = url.searchParams.get('bounds') || ''
    const bounds = text.split(',').map(Number)
    try { if (scope === 'area' && (text.length > 100 || text.split(',').some((value) => !value.trim()))) throw Error(); stationQuery(type, bounds, scope) }
    catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid station search area or type.' })); return }
    const key = `${type}:${scope === 'philippines' ? scope : bounds.join(',')}`
    let entry = cache.get(key)
    if (!entry || Date.now() - entry.savedAt > 7 * 86400000) {
      if (cache.size >= 48) cache.delete(cache.keys().next().value)
      entry = { savedAt: Date.now(), promise: scope === 'philippines' ? nationwideStations(type, request) : fetchStationArea(type, bounds, request) }
      cache.set(key, entry)
    }
    try { const data = await entry.promise; if (!res.destroyed) res.end(JSON.stringify(data)) }
    catch (error) { if (cache.get(key) === entry) cache.delete(key); if (!res.destroyed) { res.statusCode = 503; res.end(JSON.stringify({ error: error.message })) } }
  }
}

export function preloadStations() {
  const handler = stationMiddleware()
  return Promise.allSettled(Object.keys(selectors).map((type) => handler(
    { url: `/api/stations?type=${type}&scope=philippines`, method: 'GET' },
    { setHeader() {}, end(body) {
      const data = JSON.parse(body)
      if (data.error) console.warn(`[stations] ${type}: ${data.error}`)
      else console.info(`[stations] ${type}: ${data.elements.length} locations cached`)
    } }, () => {},
  )))
}

export function stationsPlugin() {
  return { name: 'roadsafe-stations', configureServer(server) { server.middlewares.use(stationMiddleware()); void preloadStations() },
    configurePreviewServer(server) { server.middlewares.use(stationMiddleware()); void preloadStations() } }
}
