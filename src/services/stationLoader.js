// Fetch a modest, reusable area around the requested radius instead of a fixed
// province. Grid rounding also avoids sending exact incident coordinates.
// The same-origin gateway identifies the app to providers and avoids browser
// CORS failures that hide upstream HTTP errors as "Failed to fetch".
const ENDPOINTS = ['/api/stations']
const TTL = 7 * 24 * 60 * 60 * 1000
const MAX_AREAS = 12

export function stationSearchBounds(center, radiusKm) {
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite)
    || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 85 || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
    throw new Error('Choose a valid station search center and radius.')
  }
  const [lng, lat] = center
  const dLat = radiusKm / 110.574
  const dLng = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180))
  const down = (value) => Math.floor(value * 10) / 10
  const up = (value) => Math.ceil(value * 10) / 10
  return [down(lat - dLat), down(lng - dLng), up(lat + dLat), up(lng + dLng)]
}

function address(tags) {
  return [[tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'] || tags['addr:neighbourhood'], tags['addr:city'] || tags['addr:municipality'], tags['addr:province']].filter(Boolean).join(', ')
}

export function createStationLoader(type, selectors, kindOf) {
  const cacheKey = `roadsafe:${type}-stations:v2`
  const memory = new Map()
  let nationalPending
  const read = () => {
    try { const value = JSON.parse(localStorage.getItem(cacheKey)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
    catch { return {} }
  }
  async function loadStations({ center, radiusKm, signal, force = false, nationwide = false } = {}) {
    const key = nationwide ? 'philippines' : stationSearchBounds(center, radiusKm).join(',')
    const cached = memory.get(key) || read()[key]
    const usableCache = cached && Number.isFinite(cached.savedAt)
      && Array.isArray(cached.stations) && (!nationwide || cached.stations.length > 0) && cached.stations.every((station) => station && Number.isFinite(station.lat) && Number.isFinite(station.lng) && Math.abs(station.lat) <= 90 && Math.abs(station.lng) <= 180)
    if (!force && usableCache && Date.now() - cached.savedAt < TTL) {
      if (cached.warning) cached.stations.warning = cached.warning
      return cached.stations
    }
    let lastError
    for (const endpoint of ENDPOINTS) {
      if (signal?.aborted) throw new DOMException('Station search cancelled', 'AbortError')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, nationwide ? 125000 : 45000)
      try {
        const params = nationwide ? { type, scope: 'philippines' } : { type, bounds: key }
        const response = await fetch(`${endpoint}?${new URLSearchParams(params)}`, { signal: controller.signal })
        if (!response.ok) {
          let message = `Station service returned HTTP ${response.status ?? 'error'}.`
          try { const failure = await response.json(); if (failure.error) message = failure.error } catch { /* Static hosts may return HTML instead of the API. */ }
          throw new Error(message)
        }
        const contentType = response.headers?.get('content-type')
        if (contentType && !contentType.includes('application/json')) throw new Error('Station service returned an unexpected response instead of JSON.')
        const data = await response.json()
        if (data.remark || !Array.isArray(data.elements)) throw new Error(data.remark || 'Invalid station response')
        if (signal?.aborted) throw new DOMException('Station search cancelled', 'AbortError')
        const stations = new Map()
        for (const element of data.elements) {
          const lat = element.lat ?? element.center?.lat
          const lng = element.lon ?? element.center?.lon
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
          const tags = element.tags || {}
          const id = `${element.type}/${element.id}`
          const kind = kindOf(tags)
          stations.set(id, { id, name: tags.name || tags['name:en'] || kind, kind, address: address(tags), lat, lng })
        }
        const result = [...stations.values()]
        if (data.warning) result.warning = data.warning
        const entry = { savedAt: Date.now(), stations: result, warning: data.warning }
        memory.delete(key)
        memory.set(key, entry)
        if (memory.size > MAX_AREAS) memory.delete(memory.keys().next().value)
        try {
          const areas = { ...read(), [key]: entry }
          const recent = Object.entries(areas).filter(([, value]) => Number.isFinite(value?.savedAt))
            .sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_AREAS)
          localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(recent)))
        } catch { /* Memory cache remains available if browser storage is full. */ }
        return result
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Station search cancelled', 'AbortError')
        lastError = error instanceof TypeError
          ? new Error('Could not reach the RoadSafe station service.')
          : error
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    }
    if (usableCache) {
      console.error(`${type} station refresh failed; using saved geography:`, lastError)
      const result = [...cached.stations]
      result.warning = `Showing saved data from ${new Date(cached.savedAt).toLocaleDateString('en-PH')}. Station updates are temporarily unavailable.`
      return result
    }
    throw new Error(`Could not load ${type} stations. ${lastError?.message || 'Network error'}`)
  }
  return function load(options = {}) {
    if (!options.nationwide) return loadStations(options)
    // A hidden layer must not cancel the inventory shared by other deployments.
    if (options.signal?.aborted) return Promise.reject(new DOMException('Station search cancelled', 'AbortError'))
    if (!nationalPending) {
      nationalPending = loadStations({ ...options, signal: undefined }).finally(() => { nationalPending = undefined })
    }
    const pending = nationalPending
    if (!options.signal) return pending
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Station search cancelled', 'AbortError'))
      options.signal.addEventListener('abort', abort, { once: true })
      pending.then(resolve, reject).finally(() => options.signal.removeEventListener('abort', abort))
    })
  }
}
