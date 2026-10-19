import { useCategories } from './CategoryContext.js';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  setWorkerUrl,
} from "maplibre-gl";

import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

import { ACCIDENT_CATEGORIES, REPORT_STATUSES, reportsToGeoJSON } from "../models/report.js";

import usePoliceStations, {
  RADIUS_OPTIONS_KM,
} from "../hooks/usePoliceStations.js";

import useMedicalStations from "../hooks/useMedicalStations.js";

import useRadiusArea from "../hooks/useRadiusArea.js";

import useResponderState from "../hooks/useResponderState.js";
import { previewRoute, fetchRoute, focusRoute, animateRoutes } from "../services/routing.js";
import DispatchDrag from "./DispatchDrag.jsx";
import { nearbyStreetFeatures } from "../services/affectedStreets.js";
import ResponderCard from "./ResponderCard.jsx";
import MapReportCard from "./MapReportCard.jsx";
import AccidentCategoryIcon from "./AccidentCategoryIcon.jsx";
import { registerAccidentIcons } from "../models/accidentIcons.js";
import { luzonReportsResponse, LUZON_SAMPLE_BOUNDS } from "../data/luzonReports.js";

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;


const MAP_STYLE = `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json${
  CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : ""
}`;

const COLORS = {
  background: "#17191c",
  land: "#202226",
  roads: "#45484d",
  majorRoads: "#62666d",
  buildings: "#2c2f34",
  water: "#191c20",
  labels: "#aeb3bb",
};

const CASE_COLOR = ["coalesce", ["get", "caseColor"], "#94a3b8"];
const REPORT_COLOR = ["match", ["get", "reportType"],
  ...ACCIDENT_CATEGORIES.filter((c) => c.id !== "other").flatMap((c) => [c.id, c.color]),
  ACCIDENT_CATEGORIES.find((c) => c.id === "other").color];
const INITIAL_CENTER = [120.88, 14.85];
function applyRoadSafeBasemapStyle(map) {
  const layers = map.getStyle()?.layers || [];

  for (const layer of layers) {
    const id = layer.id.toLowerCase();

    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", COLORS.background);
        continue;
      }

      if (layer.type === "symbol") {
        if (layer.layout?.["text-field"]) {
          map.setPaintProperty(layer.id, "text-color", COLORS.labels);
          map.setPaintProperty(layer.id, "text-halo-color", COLORS.background);
          map.setPaintProperty(layer.id, "text-halo-width", 1.2);
          map.setPaintProperty(layer.id, "text-halo-blur", 0.4);
        }

        if (
          layer.layout?.["icon-image"] &&
          map.getPaintProperty(layer.id, "icon-opacity") !== undefined
        ) {
          map.setPaintProperty(layer.id, "icon-opacity", 0.65);
        }

        continue;
      }

      if (layer.type === "fill") {
        if (id.includes("water")) {
          map.setPaintProperty(layer.id, "fill-color", COLORS.water);
        } else if (id.includes("building") || id.includes("structure")) {
          map.setPaintProperty(layer.id, "fill-color", COLORS.buildings);
        } else if (
          id.includes("park") ||
          id.includes("grass") ||
          id.includes("landcover") ||
          id.includes("land-use") ||
          id.includes("landuse")
        ) {
          map.setPaintProperty(layer.id, "fill-color", "#23262a");
        } else if (id.includes("boundary") || id.includes("admin")) {
          map.setPaintProperty(layer.id, "fill-color", "#292c31");
          map.setPaintProperty(layer.id, "fill-opacity", 0.18);
        } else {
          map.setPaintProperty(layer.id, "fill-color", COLORS.land);
        }

        continue;
      }

      if (layer.type === "line") {
        if (id.includes("water")) {
          map.setPaintProperty(layer.id, "line-color", COLORS.water);
        } else if (
          id.includes("motorway") ||
          id.includes("trunk") ||
          id.includes("primary") ||
          id.includes("highway")
        ) {
          map.setPaintProperty(layer.id, "line-color", COLORS.majorRoads);
        } else if (id.includes("boundary") || id.includes("admin")) {
          map.setPaintProperty(layer.id, "line-color", "#555a62");
          map.setPaintProperty(layer.id, "line-opacity", 0.55);
        } else {
          map.setPaintProperty(layer.id, "line-color", COLORS.roads);
        }

        continue;
      }

      if (layer.type === "fill-extrusion") {
        map.setPaintProperty(
          layer.id,
          "fill-extrusion-color",
          COLORS.buildings,
        );
      }
    } catch (error) {
      console.debug(`Skipped basemap layer "${layer.id}"`, error);
    }
  }
}

function addReportLayers(map) {
  if (map.getSource("roadsafe-reports")) return;

  map.addSource("roadsafe-reports", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 48,
  });

  map.addLayer({
    id: "roadsafe-heatmap",
    type: "heatmap",
    source: "roadsafe-reports",
    maxzoom: 13,
    paint: {
      "heatmap-weight": [
        "interpolate",
        ["linear"],
        ["get", "_severityWeight"],
        1,
        0.25,
        3,
        1,
      ],
      "heatmap-intensity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        0.5,
        12,
        1.4,
      ],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 12, 12, 34],
      "heatmap-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        0.72,
        13,
        0.25,
      ],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(0,0,0,0)",
        0.2,
        "#352a4b",
        0.4,
        "#7c3aed",
        0.65,
        "#ef4444",
        0.85,
        "#f97316",
        1,
        "#facc15",
      ],
    },
  });

  map.addLayer({
    id: "roadsafe-clusters",
    type: "circle",
    source: "roadsafe-reports",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#292d33",
      "circle-radius": [
        "step",
        ["get", "point_count"],
        17,
        10,
        22,
        30,
        28,
        75,
        34,
      ],
      "circle-stroke-color": "#a7adb7",
      "circle-stroke-width": 1.5,
      "circle-opacity": 0.96,
    },
  });

  map.addLayer({
    id: "roadsafe-cluster-count",
    type: "symbol",
    source: "roadsafe-reports",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
      "text-font": ["Open Sans Bold"],
    },
    paint: {
      "text-color": "#f4f5f7",
      "text-halo-color": "#202226",
      "text-halo-width": 1,
    },
  });

  map.addLayer({
    id: "roadsafe-report-glow",
    type: "circle",
    source: "roadsafe-reports",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "_accidentRadiusPixels0"], 24, ["*", 16777216, ["get", "_accidentRadiusPixels0"]]],
      "circle-color": CASE_COLOR,
      "circle-opacity": 0.10,
      "circle-blur": 0,
      "circle-stroke-color": CASE_COLOR,
      "circle-stroke-width": 1,
      "circle-stroke-opacity": 0.35,
    },
  });

  map.addSource("roadsafe-affected-streets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "roadsafe-affected-streets",
    type: "line",
    source: "roadsafe-affected-streets",
    minzoom: 13,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": CASE_COLOR, "line-width": 1.5, "line-opacity": 0.85 },
  });

  map.addLayer({
    id: "roadsafe-report-points",
    type: "symbol",
    source: "roadsafe-reports",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["concat", "roadsafe-accident-", ["get", "reportType"], "-", ["coalesce", ["get", "caseColor"], "#94a3b8"]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 1.1, 10, 1.05, 14, 1, 17, 0.95, 22, 0.95],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
}

function filterReports(reports, selectedTypes, includePending, selectedStatus) {
  return {
    type: "FeatureCollection",
    features: (reports.features || []).filter((feature) => {
      const properties = feature.properties || {};

      return (
        selectedTypes.includes(properties.reportType) && (!selectedStatus || properties.status === selectedStatus) &&
        (includePending || properties.verified)
      );
    }),
  };
}

export default function MapView({ searchLocation, reportRecords, users, onOpenReport }) {
  const REPORT_TYPES = useCategories();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [selectedTypes, setSelectedTypes] = useState(
    REPORT_TYPES.map((type) => type.id),
  );
  const [sampleMode, setSampleMode] = useState(true);
  const mapRecords = sampleMode ? luzonReportsResponse.data : reportRecords;
  const [includePending, setIncludePending] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState("");
  const reports = useMemo(() => reportsToGeoJSON(mapRecords), [mapRecords]);
  const [mapError, setMapError] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const selectedFeature = reports.features.find((feature) => feature.id === selectedReportId
    && selectedTypes.includes(feature.properties.reportType) && (!selectedStatus || feature.properties.status === selectedStatus)
    && (includePending || feature.properties.verified));
  const selectedReport = useMemo(() => selectedFeature ? {
    ...selectedFeature.properties, coordinates: selectedFeature.geometry.coordinates,
  } : null, [selectedFeature]);
  const selectedRecord = selectedFeature ? mapRecords.find((report) => report.id === selectedReportId) : null;
  useEffect(() => {
    if (selectedReportId && !selectedFeature) setSelectedReportId(null);
  }, [selectedReportId, selectedFeature]);
  const [mapReady, setMapReady] = useState(false);
  const [radiusKm, setRadiusKm] = useState(2.5);
  const [selectedStation, setSelectedStation] = useState(null);
  const [personnelByStation, setPersonnelByStation] = useState({});
  const responders = useResponderState(selectedStation);
  const [routes, setRoutes] = useState({});
  const routeCache = useRef(new Map());
  const activeRequests = responders.activeRequests;
  const retainedStations = useMemo(() => activeRequests.map(({ station }) => station), [activeRequests]);
  const stationRequest = selectedStation ? responders.get(selectedStation.id).request : null;
  const routeInfo = stationRequest ? routes[stationRequest.id]?.route ?? null : null;
  useEffect(() => {
    if (!mapReady) return;
    const controller = new AbortController();
    const next = {};
    for (const { station, request } of activeRequests) {
      const route = routeCache.current.get(request.id) || previewRoute([station.lng, station.lat], request.sceneCoordinates);
      if (route) next[request.id] = { route, responderType: station.responderType };
    }
    setRoutes(next);
    const activeIds = new Set(activeRequests.map(({ request }) => request.id));
    for (const id of routeCache.current.keys()) if (!activeIds.has(id)) routeCache.current.delete(id);
    for (const { station, request } of activeRequests) {
      if (routeCache.current.has(request.id)) continue;
      fetchRoute([station.lng, station.lat], request.sceneCoordinates, { signal: controller.signal }).then((route) => {
        if (controller.signal.aborted || !route) return;
        routeCache.current.set(request.id, route);
        setRoutes((previous) => ({ ...previous, [request.id]: { route, responderType: station.responderType } }));
      });
    }
    return () => controller.abort();
  }, [mapReady, activeRequests]);
  useEffect(() => {
    if (mapReady && mapRef.current) return animateRoutes(mapRef.current, Object.values(routes));
  }, [mapReady, routes]);
  useEffect(() => {
    if (!routeInfo) return;
    // Measure the card after React commits its active-route layout.
    const frame = requestAnimationFrame(() => focusRoute(mapRef.current, routeInfo));
    return () => cancelAnimationFrame(frame);
  }, [routeInfo]);
  const focusIncident = useCallback((coordinates) => {
    const map = mapRef.current;
    if (!map) return;
    const width = map.getContainer().clientWidth;
    map.flyTo({
      center: coordinates,
      zoom: Math.max(map.getZoom(), 15),
      // Leave the incident visible beside the wider card on desktop.
      offset: width >= 760 ? [Math.min(240, width / 4), 0] : [0, -100],
      duration: 700,
    });
  }, []);

  // Keep deployment anchored to the selected accident, even after panning.
  const searchAnchor = selectedReport?.coordinates;

    const police = usePoliceStations(
    mapRef,
    mapReady,
    searchAnchor,
    radiusKm,
    setSelectedStation,
    false,
    retainedStations
  );
  const medical = useMedicalStations(
    mapRef,
    mapReady,
    searchAnchor,
    radiusKm,
    setSelectedStation,
    false,
    retainedStations
  );

    // Close the station card when its layer is hidden.
  useEffect(() => {
    if (!selectedStation) return;
    const stillShown =
      selectedStation.responderType === "police"
        ? police.deployed
        : medical.deployed;
    if (!stillShown && !stationRequest) setSelectedStation(null);
  }, [selectedStation, stationRequest, police.deployed, medical.deployed]);

  // The selected report is the "scene" that assistance is requested for.
  const scene = selectedReport?.coordinates
    ? {
        reportId: selectedReport.id || selectedReport._reportId,
        label:
          REPORT_TYPES.find((t) => t.id === selectedReport.reportType)?.label ||
          "Report",
        coordinates: selectedReport.coordinates,
      }
    : null;

  // Shows just the search radius (used when no personnel type is selected).
  const radius = useRadiusArea(
    mapRef,
    mapReady,
    searchAnchor,
    radiusKm,
  );

  // Which personnel types the "Deploy personnel" button will show.
  const [pickPolice, setPickPolice] = useState(true);
  const [pickMedical, setPickMedical] = useState(true);
  const anyDeployed = police.deployed || medical.deployed;
  const anyLoading = police.loading || medical.loading;

  const handleDeploy = () => {
    if (anyDeployed || radius.active) {
      police.hide();
      medical.hide();
      radius.hide();
      return;
    }
    // Nothing selected: just show the radius.
    if (!pickPolice && !pickMedical) {
      radius.show();
      return;
    }
    if (pickPolice) police.show();
    if (pickMedical) medical.show();
  };

  // While something is showing, changing the selection updates the map right away.
  const applyPicks = (nextPolice, nextMedical) => {
    const wasShowing = anyDeployed || radius.active;
    setPickPolice(nextPolice);
    setPickMedical(nextMedical);
    if (!wasShowing) return;

    if (!nextPolice && !nextMedical) {
      const center =
        (police.deployed && police.area?.center) ||
        (medical.deployed && medical.area?.center) ||
        undefined;
      police.hide();
      medical.hide();
      radius.show(center);
      return;
    }

    radius.hide();
    if (nextPolice) {
      if (!police.deployed) police.show();
    } else {
      police.hide();
    }
    if (nextMedical) {
      if (!medical.deployed) medical.show();
    } else {
      medical.hide();
    }
  };

  const visibleReports = useMemo(
    () => filterReports(reports, selectedTypes, includePending, selectedStatus),
    [reports, selectedTypes, includePending, selectedStatus],
  );

  const metrics = useMemo(() => {
    const features = visibleReports.features;

    return {
      total: features.length,
      verified: features.filter((feature) => feature.properties.verified)
        .length,
      pending: features.filter((feature) => !feature.properties.verified)
        .length,
    };
  }, [visibleReports]);

  const toggleType = useCallback((type) => {
    setSelectedTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    );
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // A recreated map (including Vite refresh) needs its sources populated again.
    setMapReady(false);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: INITIAL_CENTER,
      zoom: 10,
      minZoom: 3,
      maxZoom: 19,
      attributionControl: false,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      "top-right",
    );

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
      }),
      "bottom-right",
    );

    map.on("load", () => {
      try {
        applyRoadSafeBasemapStyle(map);
        registerAccidentIcons(map);
        addReportLayers(map);
        setMapReady(true);
        setMapError("");
      } catch (error) {
        console.error("Report layer setup failed:", error);
        setMapError("The basemap loaded, but report layers could not be created. Reload the page and check the browser console.");
      }
    });

    map.on("click", "roadsafe-clusters", async (event) => {
      const feature = map.queryRenderedFeatures(event.point, {
        layers: ["roadsafe-clusters"],
      })[0];

      if (!feature) return;

      const source = map.getSource("roadsafe-reports");
      try {
        const zoom = await source.getClusterExpansionZoom(feature.properties.cluster_id);
        if (mapRef.current === map) map.easeTo({ center: feature.geometry.coordinates, zoom, duration: 450 });
      } catch (error) { console.error("Could not expand cluster:", error); }
    });
    map.on("click", "roadsafe-report-points", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;

      setSelectedReportId(feature.properties.id);
      setSelectedStation(null);
      focusIncident(feature.geometry.coordinates);
    });

    for (const layerId of ["roadsafe-clusters", "roadsafe-report-points"]) {
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error || event);

      // Only report a startup error if the style has not loaded.
      if (!map.isStyleLoaded()) {
        setMapError(
          "The map could not finish loading. Check the CARTO style URL, API key, network connection, and browser console.",
        );
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Send only the filtered reports to the map source.
  // Filtering before clustering keeps cluster counts accurate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource("roadsafe-reports");
    if (source) {
      source.setData(visibleReports);
    }
  }, [visibleReports, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let previous = "";
    const update = () => {
      const source = map.getSource("roadsafe-affected-streets");
      if (!source) return;
      const data = nearbyStreetFeatures(map, visibleReports);
      const serialized = JSON.stringify(data);
      // Updating a source triggers idle again; skip identical geometry.
      if (serialized !== previous) { previous = serialized; source.setData(data); }
    };
    update();
    map.on("idle", update);
    map.on("moveend", update);
    return () => { map.off("idle", update); map.off("moveend", update); };
  }, [visibleReports, mapReady]);

  useEffect(() => {
    if (!mapReady || !searchLocation) return;
    setSelectedReportId(null);
    mapRef.current?.flyTo({ center: searchLocation.coordinates, zoom: 14, duration: 700 });
  }, [searchLocation, mapReady]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const resetMap = useCallback(() => {
    if (sampleMode) {
      mapRef.current?.fitBounds(LUZON_SAMPLE_BOUNDS, { padding: 35, duration: 700, pitch: 0, bearing: 0 });
      return;
    }
    mapRef.current?.flyTo({
      center: INITIAL_CENTER,
      zoom: 10,
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }, [sampleMode]);

  useEffect(() => {
    if (mapReady) resetMap();
  }, [mapReady, resetMap]);

  const focusSelectedReport = useCallback(() => {
    if (!selectedReport?.coordinates || !mapRef.current) return;

    focusIncident(selectedReport.coordinates);
  }, [selectedReport, focusIncident]);

  return (
    <div className="roadsafe-map-page">
      <style>{`
        .roadsafe-map-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          min-width: 0;
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          position: relative;
          color: #e5e7eb;
          font-family: Inter, system-ui, sans-serif;
        }
        .roadsafe-map-page * { box-sizing: border-box; }
        .roadsafe-map-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .roadsafe-map-title {
          margin: 0;
          font-size: 22px;
          font-weight: 650;
          letter-spacing: -.04em;
        }
        .roadsafe-map-subtitle {
          margin: 5px 0 0;
          color: #8e959f;
          font-size: 13px;
        }
        .roadsafe-map-chip {
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #30343a;
          background: #1b1e22;
          color: #b9bec6;
          border-radius: 7px;
          padding: 7px 10px;
          font-size: 12px;
        }
        .roadsafe-map-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .roadsafe-map-metric {
          border: 1px solid #30343a;
          background: #1b1e22;
          border-radius: 9px;
          padding: 13px 15px;
          min-width: 0;
        }
        .roadsafe-map-metric-label {
          color: #8e959f;
          font-size: 12px;
        }
        .roadsafe-map-metric-value {
          margin-top: 5px;
          font-size: 23px;
          font-weight: 650;
          color: #f3f4f6;
        }
        .roadsafe-map-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 272px;
          align-items: stretch;
          gap: 12px;
          min-width: 0;
        }
        .roadsafe-map-canvas {
          position: relative;
          min-width: 0;
          height: max(520px, calc(100dvh - 290px));
          min-height: 390px;
          overflow: hidden;
          border: 1px solid #30343a;
          border-radius: 10px;
          background: #17191c;
        }
        .roadsafe-map-canvas .maplibregl-map {
          width: 100%;
          height: 100%;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-group {
          background: #202328;
          border: 1px solid #393e45;
          box-shadow: 0 3px 14px #0005;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-group button {
          background-color: #202328;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-group button span {
          filter: invert(.85);
        }
        .roadsafe-map-canvas .maplibregl-ctrl-attrib {
          background: #17191ce8;
          color: #aeb3bb;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-attrib a {
          color: #c3c8d0;
        }
        .roadsafe-map-sidebar {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .roadsafe-map-panel {
          border: 1px solid #30343a;
          background: #1b1e22;
          border-radius: 9px;
          padding: 16px;
        }
        .roadsafe-map-panel-title {
          margin: 0 0 12px;
          color: #e5e7eb;
          font-size: 12px;
          font-weight: 650;
          letter-spacing: .07em;
          text-transform: uppercase;
        }
        .roadsafe-map-filter {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px 0;
          color: #c5cad1;
          font-size: 13px;
          cursor: pointer;
        }
        .roadsafe-map-filter input,
        .roadsafe-map-toggle input {
          accent-color: #d1d5db;
        }
        .roadsafe-map-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex: none;
        }
        .roadsafe-map-toggle {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
          font-size: 12px;
          color: #aeb4bd;
          cursor: pointer;
        }
        .roadsafe-map-details {
          margin-top: 0;
          padding: 16px;
          background: #15171a;
          border: 1px solid #30343a;
          border-radius: 8px;
          font-size: 12px;
          overflow-wrap: anywhere;
        }
        .roadsafe-map-button {
          border: 1px solid #41464e;
          background: #22262b;
          color: #e5e7eb;
          border-radius: 5px;
          padding: 6px 9px;
          cursor: pointer;
        }
        
                .roadsafe-pick-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 9px;
        }
        .roadsafe-pick {
          --pick-color: #9ca3af;
          padding: 3px 12px;
          border: 1px solid #41464e;
          background: #1b1e22;
          color: #8b919a;
          border-radius: 999px;
          font-size: 12px;
          cursor: pointer;
          user-select: none;
          transition: border-color .15s, color .15s, background .15s,
            box-shadow .15s;
        }
        .roadsafe-pick:hover:not(:disabled) {
          background: #22262b;
          color: #c5cad1;
        }
        .roadsafe-pick:disabled {
          opacity: .6;
          cursor: default;
        }
        .roadsafe-pick.is-on {
          border-color: var(--pick-color);
          color: #fff;
          background: #22262b;
          box-shadow: 0 0 0 1px var(--pick-color),
            0 0 12px color-mix(in srgb, var(--pick-color) 55%, transparent);
        }
        .roadsafe-pick.is-police { --pick-color: #3b82f6; }
        .roadsafe-pick.is-medic { --pick-color: #ef4444; }

        .roadsafe-map-error {
          position: absolute;
          z-index: 5;
          inset: 12px 12px auto;
          background: #2a1c1c;
          border: 1px solid #7f3333;
          color: #fecaca;
          padding: 10px 12px;
          border-radius: 7px;
          font-size: 12px;
        }
        @media (max-width: 1100px) {
          .roadsafe-map-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .roadsafe-map-sidebar {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .roadsafe-map-canvas {
            height: 55vh;
            min-height: 340px;
          }
        }
        @media (max-width: 600px) {
          .roadsafe-map-page { padding: 16px; }
          .roadsafe-map-chip { flex-wrap: wrap; }
          .roadsafe-map-metrics { gap: 6px; }
          .roadsafe-map-metric { padding: 10px; }
          .roadsafe-map-metric-value { font-size: 19px; }
          .roadsafe-map-sidebar {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>

      <header className="roadsafe-map-header">
        <div>
          <h2 className="roadsafe-map-title">Road Safety Map</h2>
          <p className="roadsafe-map-subtitle">
            {sampleMode ? "Luzon sample incidents · fictional, browser-only" : "Accident reports and traffic-risk locations"}
          </p>
        </div>

        <div className="roadsafe-map-chip">
          <select aria-label="Map report source" value={sampleMode ? "samples" : "existing"}
            className="bg-darkBg border border-darkBorder rounded p-1 text-xs min-w-0"
            onChange={(event) => {
              const samples = event.target.value === "samples";
              setSampleMode(samples); setIncludePending(samples); setSelectedStatus("");
              setSelectedReportId(null); setSelectedStation(null);
              police.hide(); medical.hide(); radius.hide();
            }}>
            <option value="samples">Luzon samples</option>
            <option value="existing">Existing reports</option>
          </select>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: mapReady ? "#4ade80" : "#fbbf24",
            }}
          />
          {mapError ? "Map setup error" : mapReady ? "Map connected" : "Loading basemap"}
          <button
            type="button"
            className="roadsafe-map-button"
            onClick={resetMap}
            style={{ marginLeft: 5 }}
          >
            Reset view
          </button>
        </div>
      </header>

      {mapError && <div className="roadsafe-map-error">{mapError}</div>}

      <section className="roadsafe-map-metrics">
        <div className="roadsafe-map-metric">
          <div className="roadsafe-map-metric-label">Visible reports</div>
          <div className="roadsafe-map-metric-value">{metrics.total}</div>
        </div>
        <div className="roadsafe-map-metric">
          <div className="roadsafe-map-metric-label">Verified</div>
          <div className="roadsafe-map-metric-value">{metrics.verified}</div>
        </div>
        <div className="roadsafe-map-metric">
          <div className="roadsafe-map-metric-label">Unverified</div>
          <div className="roadsafe-map-metric-value">{metrics.pending}</div>
        </div>
      </section>

      <div className="roadsafe-map-layout">
        <div className="roadsafe-map-canvas">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2 rounded-lg border border-white/10 bg-darkBg/90 backdrop-blur px-3 py-2 text-[10px] text-slate-300 max-w-[calc(100%-64px)]" aria-label="Accident severity colors">
            <span>Severity</span>{[["Low", "#86efac"], ["Medium", "#facc15"], ["High", "#fb923c"], ["Critical", "#fb7185"], ["Unknown", "#94a3b8"]].map(([label, color]) => <span key={label} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}
          </div>
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          <DispatchDrag mapRef={mapRef} ready={mapReady}
            getPersonnel={(station) => personnelByStation[station.id] ?? 1}
            canDispatch={(station) => !responders.get(station.id).request}
            onDispatch={(station, feature) => {
              setSelectedReportId(feature.properties.id);
              setSelectedStation(station);
              responders.requestAssistance(station.id, {
                reportId: feature.properties.id,
                label: feature.properties.reportType || 'Incident',
                coordinates: feature.geometry.coordinates,
              }, { personnel: personnelByStation[station.id] ?? 1, note: '' }, station);
            }} />
          {selectedRecord && !selectedStation && <MapReportCard
            report={selectedRecord}
            onClose={() => setSelectedReportId(null)}
            onZoom={focusSelectedReport}
            onOpenReport={sampleMode ? undefined : onOpenReport}
          />}
          {selectedStation && (
            <ResponderCard
              key={selectedStation.id}
              station={selectedStation}
              selectedPersonnel={personnelByStation[selectedStation.id] ?? 1}
              onPersonnelChange={(count) => setPersonnelByStation(previous => ({ ...previous, [selectedStation.id]: count }))}
              routeInfo={routeInfo}
              scene={scene}
              data={responders.get(selectedStation.id)}
              onStatus={(value) => responders.setStatus(selectedStation.id, value)}
              onStationStatus={(value) => responders.setStationStatus(selectedStation.id, value)}
              onRequest={(details) => scene && responders.requestAssistance(selectedStation.id, scene, details, selectedStation)}
              onRelease={() => responders.release(selectedStation.id)}
              onClose={() => setSelectedStation(null)}
            />
          )}
        </div>

        <aside className="roadsafe-map-sidebar">
          <section className="roadsafe-map-panel">
            <h3 className="roadsafe-map-panel-title">Report filters</h3>
            <select aria-label="Map report status" value={selectedStatus} onChange={(event) => { setSelectedStatus(event.target.value); if (event.target.value) setIncludePending(true); }} style={{ width: "100%", marginBottom: 12, background: "#202328", color: "#e5e7eb", padding: 6 }}>
              <option value="">All statuses</option>{REPORT_STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>

            {REPORT_TYPES.map((type) => (
              <label className="roadsafe-map-filter" key={type.id}>
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type.id)}
                  onChange={() => toggleType(type.id)}
                />
                <AccidentCategoryIcon category={type.id} className="shrink-0 text-slate-300" />
                <span>{type.label}</span>
              </label>
            ))}
            <p className="text-[10px] text-slate-500 mt-2">Icon shape = accident type · color = severity</p>

            <label className="roadsafe-map-toggle">
              <input
                type="checkbox"
                checked={includePending}
                onChange={(event) => setIncludePending(event.target.checked)}
              />
              Include unverified reports
            </label>
          </section>

          <section className="roadsafe-map-panel">
            <h3 className="roadsafe-map-panel-title">Emergency response</h3>

            <label className="roadsafe-map-toggle" style={{ marginBottom: 9 }}>
              Search radius
              <select
                value={radiusKm}
                onChange={(event) => setRadiusKm(Number(event.target.value))}
                disabled={anyLoading}
                style={{
                  marginLeft: 8,
                  background: "#202328",
                  color: "#e5e7eb",
                  border: "1px solid #393e45",
                  borderRadius: 6,
                  padding: "3px 6px",
                }}
              >
                {RADIUS_OPTIONS_KM.map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
            </label>

            <div style={{ marginBottom: 9, color: "#858c96", fontSize: 11 }}>
              {`Around: ${police.usingSelectedReport ? 'selected report' : 'map center'}`}
            </div>

            <button
              type="button"
              className="roadsafe-map-button"
              onClick={handleDeploy}
            >
              {anyLoading
                ? "Cancel loading"
                : anyDeployed
                  ? "Hide personnel"
                  : radius.active
                    ? "Hide radius"
                    : "Deploy personnel"}
            </button>

            <div className="roadsafe-pick-row">
              <button
                type="button"
                aria-pressed={pickPolice}
                className={`roadsafe-pick is-police${pickPolice ? " is-on" : ""}`}
                onClick={() => applyPicks(!pickPolice, pickMedical)}
                disabled={anyLoading}
              >
                Police
              </button>
              <button
                type="button"
                aria-pressed={pickMedical}
                className={`roadsafe-pick is-medic${pickMedical ? " is-on" : ""}`}
                onClick={() => applyPicks(pickPolice, !pickMedical)}
                disabled={anyLoading}
              >
                Medics
              </button>
            </div>

            {radius.active && (
              <div style={{ marginTop: 9, color: "#aeb4bd", fontSize: 12 }}>
                Showing {radiusKm} km radius
              </div>
            )}

            {police.deployed && police.stations.length > 0 && (
              <div style={{ marginTop: 9, color: "#aeb4bd", fontSize: 12 }}>
                {police.stations.length} police station
                {police.stations.length === 1 ? "" : "s"}{` within ${radiusKm} km`}
              </div>
            )}

            {medical.deployed && medical.stations.length > 0 && (
              <div style={{ marginTop: 6, color: "#aeb4bd", fontSize: 12 }}>
                {medical.stations.length} medical facilit
                {medical.stations.length === 1 ? "y" : "ies"}{` within ${radiusKm} km`}
              </div>
            )}

            {police.error && (
              <div style={{ marginTop: 9, color: "#f87171", fontSize: 12 }}>
                Police: {police.error}
              </div>
            )}

            {medical.error && (
              <div style={{ marginTop: 6, color: "#f87171", fontSize: 12 }}>
                Medical: {medical.error}
              </div>
            )}
          </section>

        </aside>
      </div>
    </div>
  );
}
