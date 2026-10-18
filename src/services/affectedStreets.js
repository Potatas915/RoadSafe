// Fixed ground-distance footprint. Zoom changes only its on-screen size.
// Nearby streets are illustrative, not a traffic-impact prediction.
export const ACCIDENT_RADIUS_METRES = 150
const EARTH_RADIUS = 6378137
const radians = Math.PI / 180
const latitudeScale = (latitude) => Math.cos(Math.max(-85, Math.min(85, latitude)) * radians)
export function highlightRadius(zoom, latitude = 0) {
  return ACCIDENT_RADIUS_METRES * 512 * 2 ** zoom / (2 * Math.PI * EARTH_RADIUS * latitudeScale(latitude))
}
const mercator = ([lng, lat]) => ({ x: EARTH_RADIUS * lng * radians, y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * radians / 2)) })
const geographic = ({ x, y }) => [x / EARTH_RADIUS / radians, (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / radians]

export function clipStreetSegment(a, b, center, radius) {
  const dx = b.x - a.x, dy = b.y - a.y
  const x = a.x - center.x, y = a.y - center.y
  const aa = dx * dx + dy * dy
  if (!aa) return null
  const bb = 2 * (x * dx + y * dy), cc = x * x + y * y - radius * radius
  const discriminant = bb * bb - 4 * aa * cc
  if (discriminant <= 0) return null
  const root = Math.sqrt(discriminant)
  const from = Math.max(0, (-bb - root) / (2 * aa)), to = Math.min(1, (-bb + root) / (2 * aa))
  if (from >= to) return null
  return [{ x: a.x + from * dx, y: a.y + from * dy }, { x: a.x + to * dx, y: a.y + to * dy }]
}

export function nearbyStreetFeatures(map, reports) {
  const result = { type: 'FeatureCollection', features: [] }
  const zoom = map.getZoom()
  if (zoom < 13) return result
  const layers = (map.getStyle()?.layers ?? []).filter((layer) => layer.type === 'line'
    && /road|street|highway|transport/i.test(`${layer.id} ${layer['source-layer'] ?? ''}`)
    && !/rail|boundary|water|roadsafe/i.test(layer.id)).map((layer) => layer.id)
  if (!layers.length) return result
  const { clientWidth: width, clientHeight: height } = map.getContainer()
  for (const report of reports.features) {
    const latitude = report.geometry.coordinates[1]
    const radius = highlightRadius(zoom, latitude)
    const center = map.project(report.geometry.coordinates)
    const geographicCenter = mercator(report.geometry.coordinates)
    const geographicRadius = ACCIDENT_RADIUS_METRES / latitudeScale(latitude)
    if (center.x < -radius || center.x > width + radius || center.y < -radius || center.y > height + radius) continue
    const roads = map.queryRenderedFeatures([[center.x - radius, center.y - radius], [center.x + radius, center.y + radius]], { layers })
    const seen = new Set()
    for (const road of roads) {
      const paths = road.geometry.type === 'LineString' ? [road.geometry.coordinates] : road.geometry.type === 'MultiLineString' ? road.geometry.coordinates : []
      for (const path of paths) for (let i = 1; i < path.length; i++) {
        const clipped = clipStreetSegment(mercator(path[i - 1]), mercator(path[i]), geographicCenter, geographicRadius)
        if (!clipped) continue
        const key = clipped.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).sort().join(':')
        if (seen.has(key)) continue
        seen.add(key)
        const coordinates = clipped.map(geographic)
        result.features.push({ type: 'Feature', properties: { reportId: report.id, caseColor: report.properties.caseColor }, geometry: { type: 'LineString', coordinates } })
      }
    }
  }
  return result
}
