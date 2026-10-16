// Loads police stations from OpenStreetMap via the Overpass API.
// Free, no API key required. Data (c) OpenStreetMap contributors (ODbL).
//
// All stations for the coverage area are downloaded ONCE (in the background when
// the app starts), cached in memory and in localStorage, and then filtered by
// radius locally - so pressing "Deploy personnel" is instant.

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Coverage area: [south, west, north, east]. Roughly the province of Bulacan.
// Widen this if you need more of the map covered.
export const COVERAGE_BBOX = [14.68, 120.7, 15.22, 121.22];

const CACHE_KEY = "roadsafe:police-stations:v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let memoryPromise = null;

function buildQuery() {
  const box = COVERAGE_BBOX.join(",");
  return `
    [out:json][timeout:60];
    (
      node["amenity"="police"](${box});
      way["amenity"="police"](${box});
      relation["amenity"="police"](${box});
    );
    out center tags;
  `;
}

function buildAddress(tags) {
  return [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:suburb"] || tags["addr:neighbourhood"],
    tags["addr:city"] || tags["addr:municipality"],
    tags["addr:province"],
  ]
    .filter(Boolean)
    .join(", ");
}

async function queryOverpass(endpoint, query) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  return response.json();
}

async function downloadStations() {
  const query = buildQuery();
  let data;
  let lastError;

  for (const endpoint of ENDPOINTS) {
    try {
      data = await queryOverpass(endpoint, query);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) {
    throw new Error(
      `Could not reach the OpenStreetMap server (${lastError?.message || "unknown error"}). Try again in a moment.`
    );
  }

  const stations = new Map();

  for (const element of data.elements || []) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const tags = element.tags || {};
    const id = `${element.type}/${element.id}`;

    stations.set(id, {
      id,
      name: tags.name || tags["name:en"] || "Police station",
      address: buildAddress(tags),
      lng,
      lat,
    });
  }

  return [...stations.values()];
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const { savedAt, stations } = JSON.parse(raw);
    if (!Array.isArray(stations) || stations.length === 0) return null;
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;

    return stations;
  } catch {
    return null;
  }
}

function writeCache(stations) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), stations })
    );
  } catch {
    /* storage full or unavailable - fine, memory cache still works */
  }
}

/**
 * Returns all stations in the coverage area. The first call downloads (or reads
 * the localStorage cache); every later call returns the same cached result.
 */
export function loadPoliceStations({ force = false } = {}) {
  if (memoryPromise && !force) return memoryPromise;

  memoryPromise = (async () => {
    if (!force) {
      const cached = readCache();
      if (cached) return cached;
    }

    const stations = await downloadStations();
    if (stations.length > 0) writeCache(stations);
    return stations;
  })();

  // If loading fails, allow a retry on the next call.
  memoryPromise.catch(() => {
    memoryPromise = null;
  });

  return memoryPromise;
}

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