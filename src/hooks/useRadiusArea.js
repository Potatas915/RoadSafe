import { useCallback, useEffect, useRef, useState } from "react";
import { areaGeoJSON, circleCoordinates } from "./useStationLayer.js";

// A neutral dashed circle that shows the search radius on its own
// (used when no personnel type is selected).

const SOURCE_ID = "roadsafe-radius-area";
const FILL_ID = "roadsafe-radius-area-fill";
const LINE_ID = "roadsafe-radius-area-line";
const COLOR = "#9ca3af";

const EMPTY = { type: "FeatureCollection", features: [] };

function ensureLayers(map) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(FILL_ID)) {
    map.addLayer({
      id: FILL_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: { "fill-color": COLOR, "fill-opacity": 0.07 },
    });
  }
  if (!map.getLayer(LINE_ID)) {
    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": COLOR,
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    });
  }
}

/**
 * @param mapRef         ref to the MapLibre map
 * @param mapReady       true once the map style has loaded
 * @param centerOverride optional [lng, lat] (e.g. selected report); falls back to map center
 * @param radiusKm       radius in km
 */
export default function useRadiusArea(
  mapRef,
  mapReady,
  centerOverride,
  radiusKm
) {
  const [active, setActive] = useState(false);
  const [area, setArea] = useState(null);
  const lastRadiusRef = useRef(radiusKm);

  // Draw / clear the circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    ensureLayers(map);
    map.getSource(SOURCE_ID).setData(active ? areaGeoJSON(area) : EMPTY);
  }, [active, area, mapReady, mapRef]);

  // centerArg is optional; pass it to keep the circle where it already was.
  const show = useCallback(
    (centerArg) => {
      const map = mapRef.current;
      if (!map) return;

      const mapCenter = map.getCenter();
      const center = centerArg || centerOverride || [mapCenter.lng, mapCenter.lat];

      setArea({ center, radiusKm });
      setActive(true);

      const ring = circleCoordinates(center, radiusKm);
      const lngs = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 40, duration: 600 }
      );
    },
    [mapRef, centerOverride, radiusKm]
  );

  const hide = useCallback(() => setActive(false), []);

  // Resize the circle when the radius changes while it is showing.
  useEffect(() => {
    if (lastRadiusRef.current === radiusKm) return;
    lastRadiusRef.current = radiusKm;
    if (active && area) show(area.center);
  }, [radiusKm, active, area, show]);

  return { active, show, hide };
}