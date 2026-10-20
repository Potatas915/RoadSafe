import { useCallback, useEffect, useRef, useState } from "react";
import { filterByRadius } from "../services/policeStations.js";

export const RADIUS_OPTIONS_KM = [1, 1.5, 2, 2.5, 3, 3.5, 10];

const NO_STATIONS = [];
const EMPTY = { type: "FeatureCollection", features: [] };

function toGeoJSON(stations) {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        address: s.address,
        kind: s.kind || "",
      },
    })),
  };
}

// Approximate a circle on the map as a polygon.
export function circleCoordinates([lng, lat], radiusKm, steps = 64) {
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

export function areaGeoJSON(area) {
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

// Turns an SVG string into an image MapLibre can use as a map icon.
function loadBadgeImage(map, iconId, svg) {
  if (map.hasImage(iconId)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const image = new Image(128, 128);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, 128, 128);

      if (!map.hasImage(iconId)) {
        map.addImage(iconId, ctx.getImageData(0, 0, 128, 128), {
          pixelRatio: 2,
        });
      }
      resolve();
    };
    image.onerror = () => reject(new Error("Could not create map icon"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function ensureLayers(map, ids, config) {
  await loadBadgeImage(map, ids.icon, config.badgeSvg);

  if (!map.getSource(ids.areaSource)) {
    map.addSource(ids.areaSource, { type: "geojson", data: EMPTY });
  }
  if (!map.getSource(ids.source)) {
    map.addSource(ids.source, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(ids.areaFill)) {
    map.addLayer({
      id: ids.areaFill,
      type: "fill",
      source: ids.areaSource,
      paint: { "fill-color": config.color, "fill-opacity": 0.08 },
    });
  }
  if (!map.getLayer(ids.areaLine)) {
    map.addLayer({
      id: ids.areaLine,
      type: "line",
      source: ids.areaSource,
      paint: {
        "line-color": config.color,
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }
  if (!map.getLayer(ids.layer)) {
    map.addLayer({
      id: ids.layer,
      type: "symbol",
      source: ids.source,
      layout: {
        "icon-image": ids.icon,
        // Icon size: first number = zoomed out (zoom 8), second = zoomed in (zoom 14).
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 14, 0.35],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
}

/**
 * Generic "deployable stations" map layer (police, medical, ...).
 *
 * @param config {
 *   id: string,                 unique key, e.g. "police"
 *   color: string,              colour of the search circle
 *   badgeSvg: string,           64x64 SVG used as the map icon
 *   loadStations: ({ center, radiusKm, signal }) => Promise<Station[]>,
 * }  (must be a stable object, defined outside the component)
 * @param mapRef         ref to the MapLibre map
 * @param mapReady       true once the map style has loaded
 * @param centerOverride optional [lng, lat] (e.g. selected report); falls back to map center
 * @param radiusKm       search radius in km
 */
export default function useStationLayer(
  config,
  mapRef,
  mapReady,
  centerOverride,
  radiusKm,
  onSelect,
  nationwide = false,
  retainedStations = NO_STATIONS
) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const ids = {
    source: `roadsafe-${config.id}-stations`,
    icon: `roadsafe-${config.id}-badge`,
    layer: `roadsafe-${config.id}-stations-layer`,
    areaSource: `roadsafe-${config.id}-area`,
    areaFill: `roadsafe-${config.id}-area-fill`,
    areaLine: `roadsafe-${config.id}-area-line`,
  };

  const [deployed, setDeployed] = useState(false);
  const [stations, setStations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [area, setArea] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const lastRadiusRef = useRef(radiusKm);

  // Draw / clear stations and the search circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;

    ensureLayers(map, ids, config)
      .then(() => {
        if (cancelled || !map.getSource(ids.source)) return;
        const visible = new Map((deployed ? stations : []).map((station) => [String(station.id), station]));
        for (const station of retainedStations) {
          if (station.responderType === config.id) visible.set(String(station.id), station);
        }
        map.getSource(ids.source).setData(toGeoJSON([...visible.values()]));
        map
          .getSource(ids.areaSource)
          .setData(deployed ? areaGeoJSON(area) : EMPTY);
      })
      .catch((err) => console.error(`${config.id} layer setup failed:`, err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployed, stations, area, mapReady, mapRef, config, retainedStations]);

  // Popup + pointer cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

        const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const [lng, lat] = feature.geometry.coordinates;
      onSelectRef.current?.({
        id: feature.properties.id,
        name: feature.properties.name,
        address: feature.properties.address,
        kind: feature.properties.kind,
        responderType: config.id,
        lng,
        lat,
      });
    };
    const onEnter = () => (map.getCanvas().style.cursor = "pointer");
    const onLeave = () => (map.getCanvas().style.cursor = "");

    map.on("click", ids.layer, onClick);
    map.on("mouseenter", ids.layer, onEnter);
    map.on("mouseleave", ids.layer, onLeave);

    return () => {
      map.off("click", ids.layer, onClick);
      map.off("mouseenter", ids.layer, onEnter);
      map.off("mouseleave", ids.layer, onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mapRef, config]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const hide = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setDeployed(false);
    setError("");
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

      setDeployed(true);
      setStations([]);
      setArea(null);
      setLoading(true);
      setError("");

      try {
        // Reuse the national inventory and filter the deployment radius locally.
        const all = await config.loadStations({ center, radiusKm: radius, signal: controller.signal, nationwide: true });
        if (controller.signal.aborted) return;

        setInventory(all);
        const results = nationwide ? all : filterByRadius(all, center, radius);

        setStations(results);
        setArea(nationwide ? null : { center, radiusKm: radius });
        if (all.warning) setError(all.warning);
        setDeployed(true);

        if (nationwide) {
          map.fitBounds([[116.8, 4.5], [127, 21.3]], { padding: 40, duration: 600 });
          if (!results.length) setError("No mapped stations were returned for the Philippines.");
          return;
        }
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
          setError(`None found within ${radius} km.`);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error(`${config.id} lookup failed:`, err);
          setError(err.message || "Could not load stations.");
          setDeployed(false);
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [mapRef, config, nationwide]
  );

  // Re-run the search when the radius changes while deployed.
  useEffect(() => {
    if (lastRadiusRef.current === radiusKm) return;
    lastRadiusRef.current = radiusKm;
    if (deployed && area) deploy(radiusKm, area.center);
  }, [radiusKm, deployed, area, deploy]);

  const toggle = useCallback(() => {
    if (deployed) hide();
    else deploy(radiusKm, centerOverride);
  }, [deployed, deploy, hide, radiusKm, centerOverride]);

    const show = useCallback(
    () => deploy(radiusKm, centerOverride),
    [deploy, radiusKm, centerOverride]
  );

  return {
    deployed,
    stations,
    inventory,
    loading,
    error,
    toggle,
    show,
    hide,
    area,
    usingSelectedReport: Boolean(centerOverride),
  };
}
