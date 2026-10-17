import { ROLES } from '../models/report.js'

export function getAssignees(responderType, users) {
  return users.filter((user) => user.role === ROLES.OFFICER && user.responderType === responderType).map((user) => ({ id: user.id, name: user.name, code: user.unit }))
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
