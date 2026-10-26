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
import { previewRoute, fetchRoute, focusRoute, animateRoutes, visibleReportRoutes } from "../services/routing.js";
import DispatchDrag from "./DispatchDrag.jsx";
import { nearbyStreetFeatures } from "../services/affectedStreets.js";
import ResponderCard from "./ResponderCard.jsx";
import { canRequestPersonnel } from '../data/responders.js';
import StationEnforcers from "./StationEnforcers.jsx";
import MedicalFacilityCard from './MedicalFacilityCard.jsx';
import { nearestFacilities, isMedicalFacility } from '../models/medicalFacilities.js';
import { getMedicalRecommendation, saveMedicalRecommendation } from '../backend/medicalRecommendations.js';
import MapReportCard, { MapReportPreview } from "./MapReportCard.jsx";
import useTheme from "../hooks/useTheme.js";
import AccidentCategoryIcon from "./AccidentCategoryIcon.jsx";
import { registerAccidentIcons } from "../models/accidentIcons.js";


const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY;


const styleUrl = (name) => `https://basemaps.cartocdn.com/gl/${name}/style.json${
  CARTO_API_KEY ? `?key=${encodeURIComponent(CARTO_API_KEY)}` : ""
}`;
const MAP_STYLES = { dark: styleUrl("dark-matter-gl-style"), light: styleUrl("positron-gl-style") };

const PALETTES = {
  dark: {
    background: "#0b1019", land: "#101722", roads: "#2c3748", majorRoads: "#44526b",
    buildings: "#16202e", water: "#0a121f", labels: "#8d98ab",
    park: "#121b27", admin: "#151d2b", adminLine: "#34415a",
  },
  light: {
    background: "#eaeef4", land: "#f1f4f8", roads: "#dde3ec", majorRoads: "#c2ccdb",
    buildings: "#e3e8f0", water: "#c9d9ec", labels: "#566176",
    park: "#e5eee8", admin: "#e0e5ec", adminLine: "#b4bdcb",
  },
};

const CASE_COLOR = ["coalesce", ["get", "caseColor"], "#94a3b8"];
const REPORT_COLOR = ["match", ["get", "reportType"],
  ...ACCIDENT_CATEGORIES.filter((c) => c.id !== "other").flatMap((c) => [c.id, c.color]),
  ACCIDENT_CATEGORIES.find((c) => c.id === "other").color];
const INITIAL_CENTER = [120.88, 14.85];
function applyRoadSafeBasemapStyle(map, COLORS) {
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
          map.setPaintProperty(layer.id, "fill-color", COLORS.park);
        } else if (id.includes("boundary") || id.includes("admin")) {
          map.setPaintProperty(layer.id, "fill-color", COLORS.admin);
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
          map.setPaintProperty(layer.id, "line-color", COLORS.adminLine);
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

export default function MapView({ searchLocation, reportRecords, users, onOpenReport, enforcerClient, enforcerRosterClient = enforcerClient, onAssigned }) {
  const REPORT_TYPES = useCategories();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [selectedTypes, setSelectedTypes] = useState(
    REPORT_TYPES.map((type) => type.id),
  );

  const mapRecords = reportRecords;
  const [includePending, setIncludePending] = useState(true);
  const { theme: mapTheme } = useTheme();
  const viewRef = useRef(null);
  const keepViewRef = useRef(false);
  const [dockTab, setDockTab] = useState("filters");
  const [dockOpen, setDockOpen] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState("");
  const reports = useMemo(() => reportsToGeoJSON(mapRecords), [mapRecords]);
  const [mapError, setMapError] = useState("");
  const [selectedReportId, setSelectedReportId] = useState(null);
 const [hoveredIncident, setHoveredIncident] = useState(null);
 const hoveredRecord = hoveredIncident && filterReports(reports, selectedTypes, includePending, selectedStatus).features.some(feature => feature.id === hoveredIncident.id)
 ? mapRecords.find(report => report.id === hoveredIncident.id) : null;
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
  const [visibleRouteReportIds, setVisibleRouteReportIds] = useState([]);
  const activeRequests = useMemo(() => responders.activeRequests.filter(entry => entry.station.responderType === 'police'), [responders.activeRequests]);
  const retainedStations = useMemo(() => activeRequests
    .filter(({ request }) => visibleRouteReportIds.includes(String(request.reportId)))
    .map(({ station }) => station), [activeRequests, visibleRouteReportIds]);
  const stationRequest = selectedStation?.responderType === 'police' ? responders.get(selectedStation.id).request : null;
  const routeInfo = stationRequest ? routes[stationRequest.id]?.route ?? null : null;
  useEffect(() => {
    if (!mapReady) return;
    const controller = new AbortController();
    const next = {};
    for (const { station, request } of activeRequests) {
      const route = routeCache.current.get(request.id) || previewRoute([station.lng, station.lat], request.sceneCoordinates);
      if (route) next[request.id] = { route, responderType: station.responderType, reportId: request.reportId };
    }
    setRoutes(next);
    const activeIds = new Set(activeRequests.map(({ request }) => request.id));
    for (const id of routeCache.current.keys()) if (!activeIds.has(id)) routeCache.current.delete(id);
    for (const { station, request } of activeRequests) {
      if (routeCache.current.has(request.id)) continue;
      fetchRoute([station.lng, station.lat], request.sceneCoordinates, { signal: controller.signal }).then((route) => {
        if (controller.signal.aborted || !route) return;
        routeCache.current.set(request.id, route);
        setRoutes((previous) => ({ ...previous, [request.id]: { route, responderType: station.responderType, reportId: request.reportId } }));
      });
    }
    return () => controller.abort();
  }, [mapReady, activeRequests]);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let previous, cancel;
    const update = () => {
      const visible = visibleReportRoutes(map, Object.values(routes), selectedReportId);
      const signature = visible.map(entry => entry.reportId).join('|');
      if (signature === previous) return;
      previous = signature;
      setVisibleRouteReportIds(visible.map(entry => String(entry.reportId)));
      cancel?.();
      cancel = animateRoutes(map, visible);
    };
    const onSource = (event) => { if (event.sourceId === 'roadsafe-reports') update(); };
    update();
    map.on('sourcedata', onSource);
    map.on('moveend', update);
    return () => { cancel?.(); map.off('sourcedata', onSource); map.off('moveend', update); };
  }, [mapReady, routes, selectedReportId]);
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

  const [medicalRecommendations, setMedicalRecommendations] = useState({});
  const [medicalBusy, setMedicalBusy] = useState(false);
  const [medicalMessage, setMedicalMessage] = useState('');
  const [medicalError, setMedicalError] = useState('');
  const medicalWrite = useRef(false);
  const nearbyMedical = useMemo(() => nearestFacilities(medical.inventory, searchAnchor, radiusKm), [medical.inventory, searchAnchor, radiusKm]);
  useEffect(() => {
    if (!enforcerClient || !selectedRecord) return;
    let cancelled = false;
    const id = selectedRecord.id;
    getMedicalRecommendation(enforcerClient, id).then(value => {
      if (!cancelled) setMedicalRecommendations(previous => ({ ...previous, [id]: value }));
    }).catch(() => { if (!cancelled) setMedicalError('Could not load the saved facility recommendation. Reopen the incident to retry.'); });
    return () => { cancelled = true; };
  }, [enforcerClient, selectedRecord?.id, selectedRecord?.version]);
  useEffect(() => { setMedicalMessage(''); setMedicalError(''); }, [selectedRecord?.id, enforcerClient]);
  async function recommendMedical(report, station) {
    if (medicalWrite.current || !report || !isMedicalFacility(station)) return;
    setSelectedReportId(report.id); setSelectedStation(station); setHoveredIncident(null);
    setMedicalMessage(''); setMedicalError('');
    const coordinates = [report.location.coordinates.longitude, report.location.coordinates.latitude];
    const candidates = nearestFacilities([...medical.inventory.filter(item => item.id !== station.id), station], coordinates, 50);
    if (!candidates.some(item => item.id === station.id)) { setMedicalError('Choose a hospital or clinic within 50 km of this incident.'); return; }
    const facilities = [candidates.find(item => item.id === station.id), ...candidates.filter(item => item.id !== station.id).slice(0, 4)];
    if (!enforcerClient) {
      setMedicalRecommendations(previous => ({ ...previous, [report.id]: { selectedId: station.id, facilities } }));
      setMedicalMessage('Demo recommendation saved for this session.'); return;
    }
    medicalWrite.current = true; setMedicalBusy(true);
    try {
      const saved = await saveMedicalRecommendation(enforcerClient, report, station.id, facilities);
      setMedicalRecommendations(previous => ({ ...previous, [report.id]: saved }));
      setMedicalMessage('Saved. The assigned Officer can view these locations in the mobile case.');
      try { await onAssigned?.(); } catch { setMedicalMessage('Recommendation saved. Refresh the report feed before further edits.'); }
    } catch (error) { setMedicalError('Could not save recommendation: ' + error.message); }
    finally { medicalWrite.current = false; setMedicalBusy(false); }
  }

  // Which personnel types the "Show nearby stations & facilities" button will show.
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

    // A theme change swaps basemap styles. Rebuild the map and put the camera back where it was.
    const saved = viewRef.current;
    keepViewRef.current = Boolean(saved);
    const palette = PALETTES[mapTheme];
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLES[mapTheme],
      center: saved?.center ?? INITIAL_CENTER,
      zoom: saved?.zoom ?? 10,
      minZoom: 3,
      maxZoom: 19,
      attributionControl: false,
      pitch: saved?.pitch ?? 0,
      bearing: saved?.bearing ?? 0,
    });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      "bottom-right",
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
        applyRoadSafeBasemapStyle(map, palette);
        registerAccidentIcons(map, { backing: mapTheme === "light" });
        addReportLayers(map);
        setMapReady(true);
        setMapError("");
      } catch (error) {
        console.error("Report layer setup failed:", error);
        setMapError("The basemap loaded, but report layers could not be created. Reload the page and check the browser console.");
      }
    });

    map.on("click", () => setHoveredIncident(null));
    map.on("movestart", () => setHoveredIncident(null));
    map.on("mouseenter", "roadsafe-report-points", (event) => {
      const feature = event.features?.[0];
      if (feature) setHoveredIncident({ id: feature.properties.id, x: event.point.x, y: event.point.y });
    });
    map.on("mouseleave", "roadsafe-report-points", () => setHoveredIncident(null));
    map.on("mousemove", "roadsafe-report-points", (event) => {
      const id = event.features?.[0]?.properties.id;
      setHoveredIncident(previous => previous && id ? { id, x: event.point.x, y: event.point.y } : null);
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

      setHoveredIncident(null);
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
      viewRef.current = { center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      map.remove();
      mapRef.current = null;
    };
  }, [mapTheme]);

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

  useEffect(() => {
    if (!mapReady) return;
    if (keepViewRef.current) keepViewRef.current = false;
    else resetMap();
  }, [mapReady, resetMap]);

  useEffect(() => {
    if (!mapReady || !searchLocation) return;
    if (searchLocation.reportId) {
      setSelectedTypes(REPORT_TYPES.map(type => type.id));
      setIncludePending(true);
      setSelectedStatus('');
      setSelectedStation(null);
      setHoveredIncident(null);
      setSelectedReportId(searchLocation.reportId);
      mapRef.current?.resize();
      focusIncident(searchLocation.coordinates);
    } else {
      setSelectedReportId(null);
      mapRef.current?.flyTo({ center: searchLocation.coordinates, zoom: 14, duration: 700 });
    }
  }, [searchLocation, mapReady, focusIncident]);
  const focusSelectedReport = useCallback(() => {
    if (!selectedReport?.coordinates || !mapRef.current) return;

    focusIncident(selectedReport.coordinates);
  }, [selectedReport, focusIncident]);

  return (
    <div className="roadsafe-map-page">
      <style>{`
        .roadsafe-map-page {
          --ember: #ff7a1a;
          --ember-soft: rgba(255, 122, 26, .16);
          position: relative;
          flex: 1;
          width: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          color: var(--ink);
          font-family: Inter, system-ui, sans-serif;
        }
        .roadsafe-map-page * { box-sizing: border-box; }

        /* One glass recipe shared by every floating surface. */
        .roadsafe-map-bar, .roadsafe-map-legend, .roadsafe-map-dock {
          background: var(--glass);
          -webkit-backdrop-filter: blur(18px) saturate(1.5);
          backdrop-filter: blur(18px) saturate(1.5);
          border: 1px solid var(--hair);
          box-shadow: 0 10px 32px var(--shadow), inset 0 1px 0 rgba(255, 255, 255, .07);
        }

        .roadsafe-map-canvas {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background: rgb(var(--c-bg));
        }
        .roadsafe-map-canvas .maplibregl-map { width: 100%; height: 100%; }

        /* Top-left HUD: title, live counts, source controls, legend. */
        .roadsafe-map-hud {
          position: absolute;
          z-index: 10;
          top: 12px;
          left: 12px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          max-width: calc(100% - 348px);
          pointer-events: none;
        }
        .roadsafe-map-hud > * { pointer-events: auto; }
        .roadsafe-map-bar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 14px;
          padding: 8px 10px 8px 14px;
          border-radius: 16px;
        }
        .roadsafe-map-title {
          margin: 0;
          font-size: 14px;
          font-weight: 650;
          letter-spacing: -.01em;
          line-height: 1.2;
        }
        .roadsafe-map-subtitle {
          margin: 2px 0 0;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.2;
        }
        .roadsafe-map-metrics { display: flex; gap: 6px; }
        .roadsafe-map-metric {
          display: flex;
          align-items: baseline;
          gap: 6px;
          padding: 5px 10px;
          border-radius: 10px;
          background: var(--tint);
          border: 1px solid transparent;
          white-space: nowrap;
        }
        .roadsafe-map-metric-value {
          font-size: 15px;
          font-weight: 650;
          font-variant-numeric: tabular-nums;
          color: var(--strong);
        }
        .roadsafe-map-metric-label { color: var(--muted); font-size: 11px; }
        .roadsafe-map-metric.is-verified .roadsafe-map-metric-value { color: var(--ok); }
        .roadsafe-map-metric.is-pending .roadsafe-map-metric-value { color: var(--warn); }

        .roadsafe-map-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-left: 14px;
          border-left: 1px solid var(--hair);
          color: var(--muted);
          font-size: 11px;
        }
        .roadsafe-map-status { width: 7px; height: 7px; border-radius: 50%; flex: none; }
        .roadsafe-map-status.is-ready { background: var(--ok); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 22%, transparent); }
        .roadsafe-map-status.is-wait { background: var(--warn); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 22%, transparent); }
        .roadsafe-map-button {
          border: 1px solid var(--hair);
          background: var(--tint-2);
          color: var(--ink);
          border-radius: 9px;
          padding: 5px 10px;
          font-size: 11px;
          cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .roadsafe-map-button:hover { background: var(--tint-3); border-color: var(--hair-hi); }

        .roadsafe-map-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 10.5px;
          color: var(--ink-2);
        }
        .roadsafe-map-legend span.item { display: flex; align-items: center; gap: 5px; }
        .roadsafe-map-legend i.dot { width: 7px; height: 7px; border-radius: 50%; display: block; }

        /* Select controls */
        .roadsafe-select {
          appearance: none;
          -webkit-appearance: none;
          background-color: var(--tint-2);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238d98ab' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 9px center;
          border: 1px solid var(--hair);
          border-radius: 9px;
          color: var(--ink);
          font-size: 11.5px;
          padding: 5px 26px 5px 10px;
          min-width: 0;
          cursor: pointer;
        }
        .roadsafe-select:hover { border-color: var(--hair-hi); }

        /* Right dock: Filters / Response */
        .roadsafe-map-dock {
          position: absolute;
          z-index: 10;
          top: 12px;
          right: 12px;
          width: 312px;
          max-height: calc(100% - 168px);
          display: flex;
          flex-direction: column;
          border-radius: 18px;
          overflow: hidden;
        }
        .roadsafe-map-dock-head {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px;
        }
        .roadsafe-map-tabs {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px;
          padding: 3px;
          border-radius: 12px;
          background: var(--well);
        }
        .roadsafe-map-tab {
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          padding: 6px 8px;
          cursor: pointer;
          transition: background .15s, color .15s;
        }
        .roadsafe-map-tab:hover { color: var(--ink); }
        .roadsafe-map-tab[aria-selected="true"] {
          background: var(--glass-solid);
          color: var(--strong);
          box-shadow: 0 1px 3px var(--shadow), inset 0 1px 0 rgba(255, 255, 255, .08);
        }
        .roadsafe-map-collapse {
          flex: none;
          width: 30px;
          height: 30px;
          border: 1px solid var(--hair);
          border-radius: 10px;
          background: var(--tint);
          color: var(--muted);
          cursor: pointer;
        }
        .roadsafe-map-collapse:hover { color: var(--strong); border-color: var(--hair-hi); }
        .roadsafe-map-collapse i { transition: transform .2s; }
        .roadsafe-map-collapse[aria-expanded="false"] i { transform: rotate(180deg); }
        .roadsafe-map-dock-body {
          overflow-y: auto;
          padding: 2px 12px 12px;
          border-top: 1px solid var(--hair);
          padding-top: 12px;
        }
        .roadsafe-map-panel[hidden] { display: none; }
        .roadsafe-map-panel .roadsafe-select { width: 100%; margin-bottom: 8px; }

        .roadsafe-map-filter {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 6px 8px;
          margin: 0 -8px;
          border-radius: 9px;
          color: var(--ink-2);
          font-size: 12.5px;
          cursor: pointer;
          transition: background .12s;
        }
        .roadsafe-map-filter:hover { background: var(--tint); }
        .roadsafe-map-filter svg { width: 20px; height: 20px; }
        .roadsafe-map-filter:has(input:not(:checked)) { color: var(--muted); }
        .roadsafe-map-filter input,
        .roadsafe-map-toggle input { accent-color: var(--ember); width: 14px; height: 14px; margin: 0; }
        .roadsafe-map-hint { margin: 8px 0 0; color: var(--muted); font-size: 10.5px; line-height: 1.4; }
        .roadsafe-map-toggle {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--hair);
          font-size: 12px;
          color: var(--ink-2);
          cursor: pointer;
        }
        .roadsafe-note { margin-top: 8px; color: var(--ink-3); font-size: 11.5px; }
        .roadsafe-note.is-error { color: var(--err); }
        .roadsafe-map-lede { margin: 0 0 10px; color: var(--muted); font-size: 11px; line-height: 1.45; }

        /* Emergency response controls */
        .roadsafe-response-action {
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: .5rem;
          width: 100%;
          border: 1px solid rgba(255, 122, 26, .38);
          border-radius: 12px;
          padding: .6rem .9rem;
          font-size: .78rem;
          font-weight: 650;
          line-height: 1rem;
          color: var(--ember-ink);
          background: linear-gradient(180deg, rgba(255, 122, 26, .24), rgba(255, 122, 26, .1));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
          transition: background .18s, border-color .18s, transform .18s;
        }
        .roadsafe-response-action > i { flex-shrink: 0; color: currentColor; }
        .roadsafe-response-action:hover {
          border-color: rgba(255, 150, 70, .6);
          background: linear-gradient(180deg, rgba(255, 122, 26, .34), rgba(255, 122, 26, .16));
        }
        .roadsafe-response-action:active { transform: scale(.985); }
        .roadsafe-response-radius {
          justify-content: space-between;
          margin: 0 0 8px;
          padding: 0;
          border: 0;
        }
        .roadsafe-map-panel .roadsafe-response-radius { white-space: nowrap; }
        .roadsafe-map-panel .roadsafe-response-radius .roadsafe-select { width: auto; min-width: 96px; margin: 0; }
        .roadsafe-pick-row {
          --button-color: #e2e8f0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }
        .roadsafe-pick {
          position: relative;
          width: 100%;
          min-width: 0;
          padding: 8px 6px;
          border: 1px solid var(--hair);
          border-radius: 11px;
          background: var(--tint);
          color: var(--ink-2);
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          cursor: pointer;
          user-select: none;
          transition: background .15s, border-color .15s, color .15s, box-shadow .15s;
        }
        .roadsafe-pick > span { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .roadsafe-pick > span > i { flex-shrink: 0; }
        .roadsafe-pick:hover { background: var(--tint-3); }
        .roadsafe-pick.is-police { --button-color: var(--police); --button-glow: color-mix(in srgb, var(--police) 16%, transparent); }
        .roadsafe-pick.is-medic { --button-color: var(--medic); --button-glow: color-mix(in srgb, var(--medic) 16%, transparent); }
        .roadsafe-pick.is-on {
          color: var(--button-color);
          border-color: var(--button-color);
          background: var(--button-glow);
          box-shadow: 0 0 18px var(--button-glow);
        }
        .roadsafe-pick:disabled, .roadsafe-select:disabled { opacity: .55; cursor: default; }
        .roadsafe-pick:focus-visible, .roadsafe-response-action:focus-visible,
        .roadsafe-map-tab:focus-visible, .roadsafe-map-collapse:focus-visible,
        .roadsafe-map-button:focus-visible, .roadsafe-select:focus-visible {
          outline: 2px solid var(--button-color, var(--ember));
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .roadsafe-response-action, .roadsafe-pick, .roadsafe-map-tab, .roadsafe-map-collapse i { transition: none; }
        }

        /* Map controls + attribution, glass-matched */
        .roadsafe-map-canvas .maplibregl-ctrl-group {
          background: var(--glass);
          -webkit-backdrop-filter: blur(18px) saturate(1.5);
          backdrop-filter: blur(18px) saturate(1.5);
          border: 1px solid var(--hair);
          border-radius: 12px;
          box-shadow: 0 8px 24px var(--shadow);
          overflow: hidden;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-group button { background-color: transparent; }
        .roadsafe-map-canvas .maplibregl-ctrl-group button + button { border-top: 1px solid var(--hair); }
        .roadsafe-map-canvas .maplibregl-ctrl-group button:hover { background-color: var(--tint-3); }
        .roadsafe-map-canvas .maplibregl-ctrl-group button span { filter: var(--ctrl-filter); }
        .roadsafe-map-canvas .maplibregl-ctrl-attrib {
          background: var(--glass);
          color: var(--muted);
          border-radius: 8px 0 0 0;
        }
        .roadsafe-map-canvas .maplibregl-ctrl-attrib a { color: var(--ink-3); }

        .roadsafe-map-details {
          margin-top: 0;
          padding: 16px;
          background: var(--glass-solid);
          border: 1px solid var(--hair);
          border-radius: 12px;
          font-size: 12px;
          overflow-wrap: anywhere;
        }
        .roadsafe-map-error {
          position: absolute;
          z-index: 15;
          bottom: 44px;
          left: 50%;
          transform: translateX(-50%);
          width: min(520px, calc(100% - 24px));
          background: var(--err-bg);
          -webkit-backdrop-filter: blur(14px);
          backdrop-filter: blur(14px);
          border: 1px solid var(--err-line);
          color: var(--err);
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 12px;
        }

        @media (max-width: 1100px) {
          .roadsafe-map-hud { max-width: calc(100% - 24px); }
          .roadsafe-map-dock { top: auto; bottom: 12px; right: 56px; width: min(312px, calc(100% - 140px)); max-height: 52%; }
        }
        @media (max-width: 600px) {
          .roadsafe-map-chip { border-left: 0; padding-left: 0; }
          .roadsafe-map-legend { flex-wrap: wrap; border-radius: 14px; }
        }
      `}</style>

        <div className="roadsafe-map-canvas">
          <div className="roadsafe-map-hud">
            <header className="roadsafe-map-bar">
              <div>
                <h2 className="roadsafe-map-title">Road Safety Map</h2>
                <p className="roadsafe-map-subtitle">
                  Accident reports from Reports Management
                </p>
              </div>

              <div className="roadsafe-map-metrics" aria-label="Visible report counts">
                <div className="roadsafe-map-metric">
                  <span className="roadsafe-map-metric-value">{metrics.total}</span>
                  <span className="roadsafe-map-metric-label">Visible</span>
                </div>
                <div className="roadsafe-map-metric is-verified">
                  <span className="roadsafe-map-metric-value">{metrics.verified}</span>
                  <span className="roadsafe-map-metric-label">Verified</span>
                </div>
                <div className="roadsafe-map-metric is-pending">
                  <span className="roadsafe-map-metric-value">{metrics.pending}</span>
                  <span className="roadsafe-map-metric-label">Unverified</span>
                </div>
              </div>

              <div className="roadsafe-map-chip">
                <span className={`roadsafe-map-status ${mapReady && !mapError ? "is-ready" : "is-wait"}`} aria-hidden="true" />
                <span role="status">{mapError ? "Map setup error" : mapReady ? "Map connected" : "Loading basemap"}</span>
                <button type="button" className="roadsafe-map-button" onClick={resetMap}>Reset view</button>
              </div>
            </header>

            <div className="roadsafe-map-legend" aria-label="Accident severity colors">
              <span>Severity</span>
              {[["Low", "#86efac"], ["Medium", "#facc15"], ["High", "#fb923c"], ["Critical", "#fb7185"], ["Unknown", "#94a3b8"]].map(([label, color]) => <span key={label} className="item"><i className="dot" style={{ backgroundColor: color }} />{label}</span>)}
            </div>
          </div>
          {mapError && <div className="roadsafe-map-error" role="alert">{mapError}</div>}
          {hoveredRecord && !selectedRecord && <div className="absolute z-20 pointer-events-none w-[280px] max-w-[calc(100%-24px)]" style={{ left: `clamp(12px, ${hoveredIncident.x + 18}px, calc(100% - 292px))`, top: `clamp(12px, ${hoveredIncident.y + 18}px, max(12px, calc(100% - 280px)))` }}>
            <MapReportPreview report={hoveredRecord} />
          </div>}
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          <DispatchDrag mapRef={mapRef} ready={mapReady}
            getPersonnel={(station) => personnelByStation[station.id] ?? 1}
            canDispatch={(station) => station.responderType === 'police' && canRequestPersonnel(responders.get(station.id))}
            onRecommend={(feature, station) => { const report = mapRecords.find(item => item.id === feature.properties.id); void recommendMedical(report, station); }}
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
            onOpenReport={onOpenReport}
          />}
          {selectedStation?.responderType === 'medical' && <MedicalFacilityCard
            station={selectedStation} scene={scene} nearby={nearbyMedical}
            selectedId={medicalRecommendations[selectedRecord?.id]?.selectedId}
            onSelect={station => setSelectedStation({ ...station, responderType: 'medical' })}
            onRecommend={() => void recommendMedical(selectedRecord, selectedStation)}
            busy={medicalBusy} message={medicalMessage} error={medicalError}
            onClose={() => setSelectedStation(null)} />}
          {selectedStation?.responderType === 'police' && (
            <ResponderCard
              key={selectedStation.id}
              station={selectedStation}
              enforcerPanel={enforcerRosterClient && selectedStation.responderType === 'police' ? <StationEnforcers key={selectedStation.id} client={enforcerRosterClient} station={selectedStation} report={enforcerClient ? selectedRecord : null} onAssigned={onAssigned} /> : null}
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
          <aside className="roadsafe-map-dock" aria-label="Map controls">
            <div className="roadsafe-map-dock-head">
              <div className="roadsafe-map-tabs" role="tablist" aria-label="Map controls">
                <button type="button" role="tab" id="roadsafe-tab-filters" aria-controls="roadsafe-panel-filters" aria-selected={dockTab === "filters"} className="roadsafe-map-tab" onClick={() => { setDockTab("filters"); setDockOpen(true); }}>Filters</button>
                <button type="button" role="tab" id="roadsafe-tab-response" aria-controls="roadsafe-panel-response" aria-selected={dockTab === "response"} className="roadsafe-map-tab" onClick={() => { setDockTab("response"); setDockOpen(true); }}>Response</button>
              </div>
              <button type="button" className="roadsafe-map-collapse" aria-expanded={dockOpen} aria-label={dockOpen ? "Collapse map controls" : "Expand map controls"} onClick={() => setDockOpen(open => !open)}>
                <i aria-hidden="true" className="fa-solid fa-chevron-up" />
              </button>
            </div>
            <div className="roadsafe-map-dock-body" hidden={!dockOpen}>
          <section className="roadsafe-map-panel" id="roadsafe-panel-filters" role="tabpanel" aria-labelledby="roadsafe-tab-filters" hidden={dockTab !== "filters"}>
            <h3 className="sr-only">Report filters</h3>
            <select aria-label="Map report status" value={selectedStatus} onChange={(event) => { setSelectedStatus(event.target.value); if (event.target.value) setIncludePending(true); }} className="roadsafe-select">
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
            <p className="roadsafe-map-hint">Icon shape = accident type · color = severity</p>

            <label className="roadsafe-map-toggle">
              <input
                type="checkbox"
                checked={includePending}
                onChange={(event) => setIncludePending(event.target.checked)}
              />
              Include unverified reports
            </label>
          </section>
          <section className="roadsafe-map-panel" id="roadsafe-panel-response" role="tabpanel" aria-labelledby="roadsafe-tab-response" hidden={dockTab !== "response"}>
            <h3 className="sr-only">Emergency response</h3>
            <p className="roadsafe-map-lede">Drag police stations to incidents. Drag incidents to hospitals or clinics to recommend a location to the responding Officer.</p>

            <label className="roadsafe-map-toggle roadsafe-response-radius">
              Search radius
              <select
                className="roadsafe-select"
                value={radiusKm}
                onChange={(event) => setRadiusKm(Number(event.target.value))}
                disabled={anyLoading}
              >
                {RADIUS_OPTIONS_KM.map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
            </label>

            <div className="roadsafe-map-hint" style={{ margin: "0 0 8px" }}>
              {`Around: ${police.usingSelectedReport ? 'selected report' : 'map center'}`}
            </div>

            <button
              type="button"
              className="roadsafe-response-action"
              onClick={handleDeploy}
            >
              <i aria-hidden="true" className={`fa-solid ${anyLoading ? 'fa-xmark' : anyDeployed || radius.active ? 'fa-eye-slash' : 'fa-location-crosshairs'}`} />
              <span>{anyLoading
                ? "Cancel loading"
                : anyDeployed
                  ? "Hide stations & facilities"
                  : radius.active
                    ? "Hide radius"
                    : "Show nearby stations & facilities"}</span>
            </button>

            <div className="roadsafe-pick-row">
              <button
                type="button"
                aria-pressed={pickPolice}
                className={`roadsafe-pick is-police${pickPolice ? " is-on" : ""}`}
                onClick={() => applyPicks(!pickPolice, pickMedical)}
                disabled={anyLoading}
              >
                <span><i aria-hidden="true" className="fa-solid fa-shield-halved" /> Police</span>
              </button>
              <button
                type="button"
                aria-pressed={pickMedical}
                className={`roadsafe-pick is-medic${pickMedical ? " is-on" : ""}`}
                onClick={() => applyPicks(pickPolice, !pickMedical)}
                disabled={anyLoading}
              >
                <span><i aria-hidden="true" className="fa-solid fa-hospital" /> Hospitals / Clinics</span>
              </button>
            </div>

            {radius.active && (
              <div className="roadsafe-note">
                Showing {radiusKm} km radius
              </div>
            )}

            {police.deployed && police.stations.length > 0 && (
              <div className="roadsafe-note">
                {police.stations.length} police station
                {police.stations.length === 1 ? "" : "s"}{` within ${radiusKm} km`}
              </div>
            )}

            {medical.deployed && medical.stations.length > 0 && (
              <div className="roadsafe-note">
                {medical.stations.length} medical facilit
                {medical.stations.length === 1 ? "y" : "ies"}{` within ${radiusKm} km`}
              </div>
            )}

            {police.error && (
              <div className="roadsafe-note is-error">
                Police: {police.error}
              </div>
            )}

            {medical.error && (
              <div className="roadsafe-note is-error">
                Medical: {medical.error}
              </div>
            )}
          </section>
            </div>
          </aside>
        </div>
    </div>
  );
}
