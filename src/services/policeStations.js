// OpenStreetMap station geography; downloaded per search area and cached locally.
import { createStationLoader } from './stationLoader.js'

export const loadPoliceStations = createStationLoader('police', ['["amenity"="police"]'], () => 'Police Station')

function distanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Stations within radiusKm of center ([lng, lat]), nearest first. */
export function filterByRadius(stations, center, radiusKm) {
  return stations
    .map((s) => ({ ...s, distanceKm: distanceKm(center, [s.lng, s.lat]) }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}