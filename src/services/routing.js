const valid = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90

export function previewRoute(from, to) {
  if (!valid(from) || !valid(to)) return null
  return { geometry: { type: 'LineString', coordinates: [from, to] }, isFallback: true }
}

export async function fetchRoute(from, to, { signal, fetchImpl = globalThis.fetch } = {}) {
  const fallback = previewRoute(from, to)
  if (!fallback) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, 5000)
  try {
    const response = await fetchImpl(`https://router.project-osrm.org/route/v1/driving/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`, { signal: controller.signal })
    if (!response.ok) throw new Error('Route unavailable')
    const body = await response.json()
    const route = body.routes?.[0]
    if (body.code !== 'Ok' || route?.geometry?.type !== 'LineString' || route.geometry.coordinates?.length < 2 || !route.geometry.coordinates?.every(valid)) throw new Error('Invalid route')
    return { geometry: route.geometry, isFallback: false }
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function drawRoute(map, route, responderType = 'police') {
  drawRoutes(map, route ? [{ route, responderType }] : [])
}

// The clustered source exposes individual accidents only once they separate.
export function visibleReportRoutes(map, routes, selectedReportId) {
  if (selectedReportId == null) return []
  const ids = new Set(map.querySourceFeatures('roadsafe-reports')
    .filter(feature => !feature.properties.point_count)
    .map(feature => String(feature.properties.id)))
  return routes.filter(entry => String(entry.reportId) === String(selectedReportId) && ids.has(String(entry.reportId)))
}

// Reveal along cumulative segment lengths, including two-point fallback routes.
export function routePrefix(coordinates, progress) {
  if (progress >= 1) return coordinates
  const lengths = coordinates.slice(1).map((point, i) => Math.hypot(point[0] - coordinates[i][0], point[1] - coordinates[i][1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, progress)
  const result = [coordinates[0]]
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) { result.push(coordinates[i + 1]); remaining -= lengths[i]; continue }
    const t = lengths[i] ? remaining / lengths[i] : 0
    result.push(coordinates[i].map((value, axis) => value + (coordinates[i + 1][axis] - value) * t))
    break
  }
  return result.length > 1 ? result : [coordinates[0], coordinates[0]]
}

const displayedRoutes = new WeakMap()
export function animateRoutes(map, routes) {
  const previous = displayedRoutes.get(map) ?? new Set()
  displayedRoutes.set(map, new Set(routes.map(entry => entry.route)))
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { drawRoutes(map, routes); return }
  let frame, start
  const tick = (now) => {
    start ??= now
    const progress = Math.min(1, (now - start) / 850)
    drawRoutes(map, routes.map(entry => previous.has(entry.route) ? entry : {
      ...entry, route: { ...entry.route, geometry: { ...entry.route.geometry, coordinates: routePrefix(entry.route.geometry.coordinates, progress) } },
    }))
    if (progress < 1) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

export function drawRoutes(map, routes) {
  const source = 'roadsafe-personnel-route'
  if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  for (const [suffix, paint] of [
    ['casing', { 'line-color': '#0b1329', 'line-width': 5 }],
    ['line', { 'line-color': ['match', ['get', 'responderType'], 'medical', '#ef4444', '#3b82f6'], 'line-width': 3 }],
    ['preview', { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': ['case', ['get', 'isFallback'], 0.8, 0] }],
  ]) {
    const id = `${source}-${suffix}`
    if (!map.getLayer(id)) map.addLayer({ id, source, type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint })
    map.moveLayer(id)
  }
  map.getSource(source).setData({ type: 'FeatureCollection', features: routes.map(({ route, responderType }) => ({ type: 'Feature', properties: { responderType, isFallback: route.isFallback }, geometry: route.geometry })) })
}

export function focusRoute(map, route) {
  if (!map || !route) return
  const points = route.geometry.coordinates
  const bounds = points.reduce(([min, max], [lng, lat]) => [[Math.min(min[0], lng), Math.min(min[1], lat)], [Math.max(max[0], lng), Math.max(max[1], lat)]], [[Infinity, Infinity], [-Infinity, -Infinity]])
  const container = map.getContainer()
  // The React card is a sibling of MapLibre's container, not its child.
  const card = container.parentElement?.querySelector('[data-responder-card]')
  const padding = routePadding(container.clientWidth, container.clientHeight, card)
  map.fitBounds(bounds, { padding, maxZoom: 16, duration: 650 })
}

export function routePadding(width, height, card) {
  const gap = Math.min(32, width * 0.06, height * 0.06)
  const padding = { top: gap, right: gap, bottom: gap, left: gap }
  if (!card) return padding
  if (width - card.offsetWidth - 36 >= 180) {
    padding.left = card.offsetWidth + 36
  } else {
    padding.bottom = Math.min(card.offsetHeight + 36, height - gap - 100)
  }
  return padding
}
