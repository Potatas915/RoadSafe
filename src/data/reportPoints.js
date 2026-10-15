// Sample accident points around Bulacan. Replace with GeoJSON from your backend.
// Coordinates are [longitude, latitude]. severity: 1 = minor, 2 = injury, 3 = fatal/serious.

export const TYPES = [
  { key: 'intersection', label: 'Dangerous Intersections' },
  { key: 'congestion', label: 'Traffic Congestion Hotspots' },
  { key: 'distraction', label: 'Distractions & Obstructions' },
  { key: 'pedestrian', label: 'Pedestrian Collisions' },
]

const centers = [
  { lng: 120.811, lat: 14.843, n: 14, spread: 0.014 }, // Malolos
  { lng: 120.901, lat: 14.954, n: 9, spread: 0.011 },  // Baliuag
  { lng: 120.961, lat: 14.737, n: 11, spread: 0.013 }, // Meycauayan
  { lng: 121.045, lat: 14.814, n: 8, spread: 0.016 },  // San Jose del Monte
  { lng: 120.857, lat: 14.886, n: 5, spread: 0.011 },  // Plaridel
]

// Small seeded random generator so the sample data is the same on every load
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = rng(2026)
const features = []

// Two fixed points that match the report table, so the modal opens for them
features.push({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [120.8114, 14.8415] },
  properties: { id: 'RA-2025-000123', type: 'intersection', severity: 2, status: 'Pending Review' },
})
features.push({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [120.9005, 14.9535] },
  properties: { id: 'RA-2025-000124', type: 'pedestrian', severity: 2, status: 'Verified' },
})

let counter = 125
centers.forEach((c) => {
  for (let i = 0; i < c.n; i++) {
    const dx = (rand() + rand() + rand() - 1.5) * c.spread
    const dy = (rand() + rand() + rand() - 1.5) * c.spread
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng + dx, c.lat + dy] },
      properties: {
        id: `RA-2025-${String(counter++).padStart(6, '0')}`,
        type: TYPES[Math.floor(rand() * 4)].key,
        severity: 1 + Math.floor(rand() * 3),
        status: rand() < 0.8 ? 'Verified' : 'Pending Review',
      },
    })
  }
})

export const reportPoints = { type: 'FeatureCollection', features }
