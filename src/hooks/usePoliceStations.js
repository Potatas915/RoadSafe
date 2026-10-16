import useStationLayer, { RADIUS_OPTIONS_KM } from "./useStationLayer.js";
import { loadPoliceStations } from "../services/policeStations.js";

export { RADIUS_OPTIONS_KM };

// Police badge: blue circle, white shield, blue star.
const POLICE_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#2563eb" stroke="#ffffff" stroke-width="4"/><path d="M32 13.5 L46 18.8 V31 C46 39.5 40.5 45.5 32 49.5 C23.5 45.5 18 39.5 18 31 V18.8 Z" fill="#ffffff"/><polygon points="32.0,23.0 34.1,28.6 40.1,28.9 35.4,32.6 37.0,38.4 32.0,35.1 27.0,38.4 28.6,32.6 23.9,28.9 29.9,28.6" fill="#2563eb"/></svg>`;

const POLICE_CONFIG = {
  id: "police",
  color: "#3b82f6",
  badgeSvg: POLICE_BADGE_SVG,
  loadStations: loadPoliceStations,
};

export default function usePoliceStations(
  mapRef,
  mapReady,
  centerOverride,
  radiusKm,
  onSelect
) {
  return useStationLayer(
    POLICE_CONFIG,
    mapRef,
    mapReady,
    centerOverride,
    radiusKm,
    onSelect
  );
}