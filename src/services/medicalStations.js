// OpenStreetMap hospital/clinic/ambulance geography, scoped to the search area.
import { createStationLoader } from './stationLoader.js'

export const loadMedicalStations = createStationLoader('medical', [
  '["amenity"~"^(hospital|clinic)$"]', '["emergency"="ambulance_station"]',
], (tags) => tags.amenity === 'hospital' ? 'Hospital' : tags.amenity === 'clinic' ? 'Clinic' : 'Ambulance Station')
