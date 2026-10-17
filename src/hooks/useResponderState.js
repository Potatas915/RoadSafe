import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_RESPONDER, createPersonnelRequest, advancePersonnelRequest, RESPONDER_STATUSES, STATION_STATUSES } from '../data/responders.js'

// v3 personnel requests are independent of historical v1/v2 staff assignments.
// Previous storage remains untouched; nothing is sent to a server.
const STORAGE_KEY = 'roadsafe:responders:v3'
function read() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([, value]) => value && (
      (value.status === DEFAULT_RESPONDER.status && value.request === null) ||
      (RESPONDER_STATUSES.includes(value.status) && value.request?.id && value.request?.requestedAt &&
        Number.isInteger(value.request.personnel) && value.request.personnel >= 1 && value.request.personnel <= 5 &&
        Array.isArray(value.request.sceneCoordinates) && value.request.sceneCoordinates.length === 2 && value.request.sceneCoordinates.every(Number.isFinite))
    )))
  } catch { return {} }
}

export default function useResponderState(selectedStation) {
  const [state, setState] = useState(read)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
    catch { /* Requests remain usable in memory if storage is unavailable. */ }
  }, [state])
  // Recover station coordinates for requests saved before station snapshots existed.
  useEffect(() => {
    if (!selectedStation) return
    setState((previous) => {
      const current = previous[selectedStation.id]
      if (!current?.request || current.station) return previous
      return { ...previous, [selectedStation.id]: { ...current, station: selectedStation } }
    })
  }, [selectedStation])
  const get = useCallback((id) => state[id] ?? DEFAULT_RESPONDER, [state])
  const setStationStatus = useCallback((id, stationStatus) => {
    if (!STATION_STATUSES.includes(stationStatus)) return
    setState((previous) => ({ ...previous, [id]: { ...DEFAULT_RESPONDER, ...previous[id], stationStatus } }))
  }, [])
  const setStatus = useCallback((id, status) => {
    setState((previous) => {
      const current = previous[id] ?? DEFAULT_RESPONDER
      return { ...previous, [id]: advancePersonnelRequest(current, status) }
    })
  }, [])
  const requestAssistance = useCallback((id, scene, details, station) => {
    const request = createPersonnelRequest(scene, details)
    if (!request) return
    setState((previous) => previous[id]?.request ? previous : {
      ...previous, [id]: { ...DEFAULT_RESPONDER, ...previous[id], status: 'Request Sent', request, station },
    })
  }, [])
  const release = useCallback((id) => {
    setState((previous) => ({ ...previous, [id]: { ...DEFAULT_RESPONDER } }))
  }, [])
  const activeRequests = useMemo(() => Object.values(state).filter((entry) => entry.request && entry.station), [state])
  return { activeRequests, get, setStatus, setStationStatus, requestAssistance, release }
}
