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
import ResponderCard from "./ResponderCard.jsx";

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

const REPORT_TYPES = ACCIDENT_CATEGORIES;
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
      "circle-radius": 15,
      "circle-color": REPORT_COLOR,
      "circle-opacity": 0.16,
      "circle-blur": 0.9,
    },
  });

  map.addLayer({
    id: "roadsafe-report-points",
    type: "circle",
    source: "roadsafe-reports",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        4,
        12,
        6,
        16,
        8,
      ],
      "circle-color": REPORT_COLOR,
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1.25,
      "circle-opacity": 0.98,
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
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [selectedTypes, setSelectedTypes] = useState(
    REPORT_TYPES.map((type) => type.id),
  );
  const [includePending, setIncludePending] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const reports = useMemo(() => reportsToGeoJSON(reportRecords), [reportRecords]);
  const [mapError, setMapError] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);
  const selectedFeature = reports.features.find((feature) => feature.id === selectedReportId
    && selectedTypes.includes(feature.properties.reportType) && (!selectedStatus || feature.properties.status === selectedStatus)
    && (includePending || feature.properties.verified));
  const selectedReport = useMemo(() => selectedFeature ? {
    ...selectedFeature.properties, coordinates: selectedFeature.geometry.coordinates,
  } : null, [selectedFeature]);
  useEffect(() => {
    if (selectedReportId && !selectedFeature) setSelectedReportId(null);
  }, [selectedReportId, selectedFeature]);
  const [mapReady, setMapReady] = useState(false);
  const [radiusKm, setRadiusKm] = useState(2.5);
  const [selectedStation, setSelectedStation] = useState(null);
  const responders = useResponderState();

    // Use the selected report as the search center only while it is visible on the
  // map. If you pan somewhere else, deploying uses the map center instead.
  const [reportInView, setReportInView] = useState(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const update = () => {
      const coords = selectedReport?.coordinates;
      setReportInView(Boolean(coords) && map.getBounds().contains(coords));
    };

    update();
    map.on("moveend", update);
    return () => map.off("moveend", update);
  }, [mapReady, selectedReport]);
  const searchAnchor = reportInView ? selectedReport?.coordinates : undefined;

    const police = usePoliceStations(
    mapRef,
    mapReady,
    searchAnchor,
    radiusKm,
    setSelectedStation
  );
  const medical = useMedicalStations(
    mapRef,
    mapReady,
    searchAnchor,
    radiusKm,
    setSelectedStation
  );

    // Close the station card when its layer is hidden.
  useEffect(() => {
    if (!selectedStation) return;
    const stillShown =
      selectedStation.responderType === "police"
        ? police.deployed
        : medical.deployed;
    if (!stillShown) setSelectedStation(null);
  }, [selectedStation, police.deployed, medical.deployed]);

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
    mapRef.current?.flyTo({
      center: INITIAL_CENTER,
      zoom: 10,
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }, []);

  const focusSelectedReport = useCallback(() => {
    if (!selectedReport?.coordinates || !mapRef.current) return;

    mapRef.current.flyTo({
      center: selectedReport.coordinates,
      zoom: 15,
      duration: 700,
    });
  }, [selectedReport]);

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
            Accident reports and traffic-risk locations
          </p>
        </div>

        <div className="roadsafe-map-chip">
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
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          {selectedStation && (
            <ResponderCard
              users={users}
              station={selectedStation}
              scene={scene}
              data={responders.get(selectedStation.id)}
              onAssign={(value) => responders.setAssignee(selectedStation.id, value)}
              onStatus={(value) => responders.setStatus(selectedStation.id, value)}
              onRequest={() => scene && responders.requestAssistance(selectedStation.id, scene)}
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
                <span
                  className="roadsafe-map-dot"
                  style={{ background: type.color }}
                />
                <span>{type.label}</span>
              </label>
            ))}

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
              Around:{" "}
              {police.usingSelectedReport ? "selected report" : "map center"}
            </div>

            <button
              type="button"
              className="roadsafe-map-button"
              onClick={handleDeploy}
              disabled={anyLoading}
            >
              {anyLoading
                ? "Loading..."
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
                {police.stations.length === 1 ? "" : "s"} within {radiusKm} km
              </div>
            )}

            {medical.deployed && medical.stations.length > 0 && (
              <div style={{ marginTop: 6, color: "#aeb4bd", fontSize: 12 }}>
                {medical.stations.length} medical facilit
                {medical.stations.length === 1 ? "y" : "ies"} within {radiusKm}{" "}
                km
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

          {selectedReport && (
            <section className="roadsafe-map-details">
              <strong style={{ color: "#f3f4f6" }}>Selected report</strong>

              <div style={{ marginTop: 8, color: "#aeb4bd" }}>
                Type: {REPORT_TYPES.find((type) => type.id === selectedReport.reportType)?.label}
              </div>

              <div style={{ marginTop: 5, color: "#aeb4bd" }}>
                Status: {selectedReport.status}
              </div>

              <div style={{ marginTop: 5, color: "#aeb4bd" }}>
                Coordinates:{" "}
                {selectedReport.coordinates
                  ?.map((value) => Number(value).toFixed(5))
                  .join(", ")}
              </div>

              {selectedReport.description && (
                <div style={{ marginTop: 7, color: "#d1d5db" }}>
                  {selectedReport.description}
                </div>
              )}

              <button type="button" className="roadsafe-map-button" onClick={focusSelectedReport}>Zoom to report</button>
              <button
                type="button"
                className="roadsafe-map-button"
                onClick={() => onOpenReport(selectedReport.id)}
              >
                View report details
              </button>

              <button
                type="button"
                className="roadsafe-map-button"
                onClick={() => setSelectedReportId(null)}
                style={{ marginLeft: 6 }}
              >
                Close
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
