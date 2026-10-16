// Fetches police stations from OpenStreetMap via the Overpass API.
// Free, no API key required. Data (c) OpenStreetMap contributors (ODbL).

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildQuery([lng, lat], radiusKm) {
  const around = `around:${Math.round(radiusKm * 1000)},${lat},${lng}`;

  return `
    [out:json][timeout:25];
    (
      node["amenity"="police"](${around});
      way["amenity"="police"](${around});
      relation["amenity"="police"](${around});
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

async function queryOverpass(endpoint, query, signal) {
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  return response.json();
}

/**
 * @param {{ center: [number, number], radiusKm: number, signal?: AbortSignal }} options
 *        center is [longitude, latitude]
 */
export async function fetchPoliceStations({ center, radiusKm, signal }) {
  const query = buildQuery(center, radiusKm);
  let data;
  let lastError;

  for (const endpoint of ENDPOINTS) {
    try {
      data = await queryOverpass(endpoint, query, signal);
      break;
    } catch (error) {
      if (error.name === "AbortError") throw error;
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