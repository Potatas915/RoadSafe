import useStationLayer from "./useStationLayer.js";
import { loadMedicalStations } from "../services/medicalStations.js";

// Medical badge: red circle with a white medical cross.
const MEDICAL_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#dc2626" stroke="#ffffff" stroke-width="4"/><path d="M27 17 H37 V27 H47 V37 H37 V47 H27 V37 H17 V27 H27 Z" fill="#ffffff" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></svg>`;

const MEDICAL_CONFIG = {
  id: "medical",
  color: "#ef4444",
  badgeSvg: MEDICAL_BADGE_SVG,
  loadStations: async (options) => {
    const stations = await loadMedicalStations(options);
    const facilities = stations.filter(station => ['hospital', 'clinic'].includes(station.kind?.toLowerCase()));
    if (stations.warning) facilities.warning = stations.warning;
    return facilities;
  },
  // Start slightly later than the police download so the two requests
  // don't hit the free OpenStreetMap server at the same instant.
  preloadDelayMs: 3000,
};

export default function useMedicalStations(
  mapRef,
  mapReady,
  centerOverride,
  radiusKm,
  onSelect,
  nationwide = false,
  retainedStations
) {
  return useStationLayer(
    MEDICAL_CONFIG,
    mapRef,
    mapReady,
    centerOverride,
    radiusKm,
    onSelect,
    nationwide,
    retainedStations
  );
}