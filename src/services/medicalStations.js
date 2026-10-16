// Loads medical stations (hospitals, clinics, ambulance stations) from
// OpenStreetMap via the Overpass API. Free, no API key required.
// Data (c) OpenStreetMap contributors (ODbL).
//
// Same approach as the police stations: downloaded once in the background,
// cached in memory + localStorage, then filtered by radius locally.

import { COVERAGE_BBOX } from "./policeStations.js";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_KEY = "roadsafe:medical-stations:v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let memoryPromise = null;

function buildQuery() {
  const box = COVERAGE_BBOX.join(",");
  return `
    [out:json][timeout:60];
    (
      node["amenity"~"^(hospital|clinic)$"](${box});
      way["amenity"~"^(hospital|clinic)$"](${box});
      relation["amenity"~"^(hospital|clinic)$"](${box});
      node["emergency"="ambulance_station"](${box});
      way["emergency"="ambulance_station"](${box});
    );
    out center tags;
  `;
}

function kindOf(tags) {
  if (tags.amenity === "hospital") return "Hospital";
  if (tags.amenity === "clinic") return "Clinic";
  if (tags.emergency === "ambulance_station") return "Ambulance station";
  return "Medical facility";
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
    const kind = kindOf(tags);

    stations.set(id, {
      id,
      name: tags.name || tags["name:en"] || kind,
      kind,
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
    /* storage full or unavailable - memory cache still works */
  }
}

/** Returns all medical stations in the coverage area (cached after first call). */
export function loadMedicalStations({ force = false } = {}) {
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