import { useCallback, useEffect, useRef, useState } from "react";
import { Popup } from "maplibre-gl";
import {
  loadPoliceStations,
  filterByRadius,
} from "../services/policeStations.js";

export const RADIUS_OPTIONS_KM = [1, 1.5, 2, 2.5, 3, 3.5];

const SOURCE_ID = "roadsafe-police-stations";
const ICON_ID = "roadsafe-police-badge";
const LAYER_ID = "roadsafe-police-stations-layer";
const AREA_SOURCE_ID = "roadsafe-police-area";
const AREA_FILL_ID = "roadsafe-police-area-fill";
const AREA_LINE_ID = "roadsafe-police-area-line";
const COLOR = "#3b82f6";

const EMPTY = { type: "FeatureCollection", features: [] };

function toGeoJSON(stations) {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: { id: s.id, name: s.name, address: s.address },
    })),
  };
}

// Approximate a circle on the map as a polygon.
function circleCoordinates([lng, lat], radiusKm, steps = 64) {
  const coords = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos(latRad));

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return coords;
}

function areaGeoJSON(area) {
  if (!area) return EMPTY;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [circleCoordinates(area.center, area.radiusKm)],
        },
        properties: {},
      },
    ],
  };
}

// Police badge: blue circle, white shield, blue star.
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#2563eb" stroke="#ffffff" stroke-width="4"/><path d="M32 13.5 L46 18.8 V31 C46 39.5 40.5 45.5 32 49.5 C23.5 45.5 18 39.5 18 31 V18.8 Z" fill="#ffffff"/><polygon points="32.0,23.0 34.1,28.6 40.1,28.9 35.4,32.6 37.0,38.4 32.0,35.1 27.0,38.4 28.6,32.6 23.9,28.9 29.9,28.6" fill="#2563eb"/></svg>`;

// Turns the SVG into an image MapLibre can use as a map icon.
function loadBadgeImage(map) {
  if (map.hasImage(ICON_ID)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const image = new Image(128, 128);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, 128, 128);

      if (!map.hasImage(ICON_ID)) {
        map.addImage(ICON_ID, ctx.getImageData(0, 0, 128, 128), {
          pixelRatio: 2,
        });
      }
      resolve();
    };
    image.onerror = () => reject(new Error("Could not create police icon"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BADGE_SVG)}`;
  });
}

async function ensureLayers(map) {
  await loadBadgeImage(map);

  if (!map.getSource(AREA_SOURCE_ID)) {
    map.addSource(AREA_SOURCE_ID, { type: "geojson", data: EMPTY });
  }
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(AREA_FILL_ID)) {
    map.addLayer({
      id: AREA_FILL_ID,
      type: "fill",
      source: AREA_SOURCE_ID,
      paint: { "fill-color": COLOR, "fill-opacity": 0.08 },
    });
  }
  if (!map.getLayer(AREA_LINE_ID)) {
    map.addLayer({
      id: AREA_LINE_ID,
      type: "line",
      source: AREA_SOURCE_ID,
      paint: {
        "line-color": COLOR,
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }
  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      layout: {
        "icon-image": ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 14, 0.35],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

/**
 * @param mapRef        ref to the MapLibre map
 * @param mapReady      true once the map style has loaded
 * @param centerOverride optional [lng, lat] (e.g. the selected report). Falls back to the map center.
 */
export default function usePoliceStations(mapRef, mapReady, centerOverride) {
  const [deployed, setDeployed] = useState(false);
  const [stations, setStations] = useState([]);
  const [area, setArea] = useState(null);
  const [radiusKm, setRadiusKmState] = useState(2.5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  // Draw / clear stations and the search circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;

    ensureLayers(map)
      .then(() => {
        if (cancelled || !map.getSource(SOURCE_ID)) return;
        map.getSource(SOURCE_ID).setData(deployed ? toGeoJSON(stations) : EMPTY);
        map
          .getSource(AREA_SOURCE_ID)
          .setData(deployed ? areaGeoJSON(area) : EMPTY);
      })
      .catch((err) => console.error("Police layer setup failed:", err));

    return () => {
      cancelled = true;
    };
  }, [deployed, stations, area, mapReady, mapRef]);

  // Popup + pointer cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const box = document.createElement("div");
      box.style.cssText =
        "color:#111;font:13px/1.4 system-ui,sans-serif;max-width:220px";

      const title = document.createElement("strong");
      title.textContent = feature.properties.name;
      box.appendChild(title);

      if (feature.properties.address) {
        const addr = document.createElement("div");
        addr.style.marginTop = "4px";
        addr.textContent = feature.properties.address;
        box.appendChild(addr);
      }

      new Popup({ offset: 12 })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(box)
        .addTo(map);
    };
    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => (map.getCanvas().style.cursor = "");

    map.on("click", LAYER_ID, onClick);
    map.on("mouseenter", LAYER_ID, onEnter);
    map.on("mouseleave", LAYER_ID, onLeave);

    return () => {
      map.off("click", LAYER_ID, onClick);
      map.off("mouseenter", LAYER_ID, onEnter);
      map.off("mouseleave", LAYER_ID, onLeave);
    };
  }, [mapReady, mapRef]);

  // Download + cache all stations in the background as soon as the app starts.
  // Nothing is drawn on the map until "Deploy personnel" is pressed.
  useEffect(() => {
    loadPoliceStations().catch((err) => {
      console.warn("Police station preload failed (will retry on deploy):", err);
    });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const hide = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setDeployed(false);
  }, []);

  const deploy = useCallback(
    async (radius, centerOverrideNow) => {
      const map = mapRef.current;
      if (!map) return;

      const mapCenter = map.getCenter();
      const center = centerOverrideNow || [mapCenter.lng, mapCenter.lat];

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError("");

      try {
        // Instant when the background preload has finished; otherwise waits for it.
        const all = await loadPoliceStations();
        if (controller.signal.aborted) return;

        const results = filterByRadius(all, center, radius);

        const nextArea = { center, radiusKm: radius };
        setStations(results);
        setArea(nextArea);
        setDeployed(true);

        const ring = circleCoordinates(center, radius);
        const lngs = ring.map((p) => p[0]);
        const lats = ring.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40, duration: 600 }
        );

        if (results.length === 0) {
          setError(`No police stations found within ${radius} km.`);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Police station lookup failed:", err);
          setError(err.message || "Could not load police stations.");
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [mapRef]
  );

  const toggle = useCallback(() => {
    if (deployed) hide();
    else deploy(radiusKm, centerOverride);
  }, [deployed, deploy, hide, radiusKm, centerOverride]);

  // Changing the radius while deployed re-runs the search.
  const setRadiusKm = useCallback(
    (value) => {
      const next = Number(value);
      setRadiusKmState(next);
      if (deployed) deploy(next, area?.center);
    },
    [deployed, deploy, area]
  );

  return {
    deployed,
    stations,
    loading,
    error,
    radiusKm,
    setRadiusKm,
    toggle,
    usingSelectedReport: Boolean(centerOverride),
  };
}