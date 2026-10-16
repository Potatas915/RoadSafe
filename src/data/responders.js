import { officers } from './mock.js'

// Police officers come from the existing Officers list.
export const POLICE_OFFICERS = officers.map((o) => ({
  id: o.name,
  name: o.name,
  code: o.unit.split(' | ')[0],
}))

// Sample medical responders. Replace with data from your backend.
export const MEDIC_TEAMS = [
  { id: 'Medic Ana Reyes', name: 'Medic Ana Reyes', code: 'MED-02' },
  { id: 'Medic Paolo Cruz', name: 'Medic Paolo Cruz', code: 'MED-05' },
  { id: 'Ambulance Unit A-1', name: 'Ambulance Unit A-1', code: 'AMB-01' },
]

export function getAssignees(responderType) {
  return responderType === 'medical' ? MEDIC_TEAMS : POLICE_OFFICERS
}

export const RESPONDER_STATUSES = [
  'Available',
  'Assistance Requested',
  'En Route',
  'On Scene',
  'Returning to Base',
  'Unavailable',
]

// Same pill colours used by the report status badges.
export const STATUS_TONE = {
  Available: 'bg-emerald-500/10 text-emerald-400',
  'Assistance Requested': 'bg-orange-500/10 text-orange-400',
  'En Route': 'bg-blue-500/10 text-blue-400',
  'On Scene': 'bg-purple-500/10 text-purple-400',
  'Returning to Base': 'bg-amber-500/10 text-amber-400',
  Unavailable: 'bg-slate-500/10 text-slate-400',
}