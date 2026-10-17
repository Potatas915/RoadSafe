export const RESPONDER_STATUSES = ['Request Sent', 'Responding', 'On Scene', 'Completed']
export const STATION_STATUSES = ['Available', 'Assistance Requested', 'En Route', 'On Scene', 'Returning to Base', 'Unavailable']
export const STATUS_TONE = {
  'Ready to request': 'bg-slate-500/10 text-slate-400',
  'Request Sent': 'bg-orange-500/10 text-orange-400',
  Responding: 'bg-blue-500/10 text-blue-400',
  'On Scene': 'bg-purple-500/10 text-purple-400',
  Completed: 'bg-emerald-500/10 text-emerald-400',
}
export const DEFAULT_RESPONDER = { status: 'Ready to request', stationStatus: 'Available', request: null }

export function createPersonnelRequest(scene, details) {
  if (!scene?.reportId || !Array.isArray(scene.coordinates) || scene.coordinates.length !== 2
    || !scene.coordinates.every(Number.isFinite) || Math.abs(scene.coordinates[0]) > 180 || Math.abs(scene.coordinates[1]) > 90
    || !Number.isInteger(details?.personnel) || details.personnel < 1 || details.personnel > 5) return null
  return {
    id: `REQ-${crypto.randomUUID()}`,
    reportId: scene.reportId,
    sceneLabel: scene.label,
    sceneCoordinates: [...scene.coordinates],
    personnel: details.personnel,
    note: String(details.note ?? '').trim().slice(0, 500),
    requestedAt: new Date().toISOString(),
  }
}

export function advancePersonnelRequest(current, nextStatus) {
  if (!current.request || RESPONDER_STATUSES.indexOf(nextStatus) !== RESPONDER_STATUSES.indexOf(current.status) + 1) return current
  return { ...current, status: nextStatus }
}
