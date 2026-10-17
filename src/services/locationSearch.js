const cache = new Map()

export async function searchLocations(query, signal, request = fetch) {
  const text = query.trim()
  if (text.length < 3) return []
  const key = text.toLowerCase()
  if (cache.has(key)) return cache.get(key)
  const url = new URL('https://photon.komoot.io/api/')
  url.search = new URLSearchParams({ q: text, limit: '5', lat: '14.85', lon: '120.88' })
  const response = await request(url, { signal })
  if (!response.ok) throw new Error('Location search is unavailable. Please try again.')
  const data = await response.json()
  if (!Array.isArray(data.features)) throw new Error('Invalid location search response.')
  const results = data.features.filter(({ geometry }) => geometry?.type === 'Point'
    && geometry.coordinates?.length === 2 && geometry.coordinates.every(Number.isFinite)
    && Math.abs(geometry.coordinates[0]) <= 180 && Math.abs(geometry.coordinates[1]) <= 90)
    .map(({ geometry, properties = {} }) => ({
      coordinates: geometry.coordinates,
      label: [...new Set([properties.name, properties.street, properties.city, properties.state, properties.country].filter(Boolean))].join(', ') || geometry.coordinates.join(', '),
    }))
  if (cache.size >= 50) cache.delete(cache.keys().next().value)
  cache.set(key, results)
  return results
}
