export const isMedicalFacility = station => ['hospital', 'clinic'].includes(station.kind?.toLowerCase())

export function facilityDistance(station, coordinates) {
  const radians = degrees => degrees * Math.PI / 180
  const [lng, lat] = coordinates
  const a = Math.sin(radians(station.lat - lat) / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(station.lat)) * Math.sin(radians(station.lng - lng) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function nearestFacilities(stations, coordinates, radiusKm = 50) {
  if (!coordinates) return []
  return stations.filter(station => isMedicalFacility(station) && Number.isFinite(station.lat) && Number.isFinite(station.lng))
    .map(station => ({ ...station, distanceKm: facilityDistance(station, coordinates) }))
    .filter(station => station.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id))
}
