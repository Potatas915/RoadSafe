import { REPORT_STATUS, ROLES, validCoordinates } from './report.js'
import { ACCIDENT_RADIUS_METRES } from '../services/affectedStreets.js'

export const DUPLICATE_REVIEW_STATUSES = Object.freeze([
  REPORT_STATUS.SUBMITTED, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.INFORMATION_REQUIRED, REPORT_STATUS.REJECTED,
])
export function duplicateOriginals(reports, reportId) {
  return reports.filter(r => r.id !== reportId && r.status !== REPORT_STATUS.REJECTED && !r.isDuplicate && !r.duplicateOfReportId)
}

export function nearbyDuplicateCandidates(reports, report) {
  const origin = report.location?.coordinates
  if (!validCoordinates(origin)) return []
  const radians = Math.PI / 180
  return duplicateOriginals(reports, report.id).filter(candidate => {
    const point = candidate.location?.coordinates
    if (!validCoordinates(point)) return false
    const a = Math.sin((point.latitude - origin.latitude) * radians / 2) ** 2
      + Math.cos(origin.latitude * radians) * Math.cos(point.latitude * radians)
      * Math.sin((point.longitude - origin.longitude) * radians / 2) ** 2
    return 6378137 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= ACCIDENT_RADIUS_METRES
  })
}

// Demo preview only. Persisted actions use the authorized, versioned RPC.
export function applyDuplicateReview(reports, id, originalId, reason, actor, now = new Date().toISOString()) {
  if (actor?.role !== ROLES.ADMIN) throw new Error('Administrator account required.')
  const old = reports.find(r => r.id === id)
  if (!old) throw new Error('Report no longer exists.')
  if (!originalId && !old.isDuplicate) throw new Error('This report is not marked as a duplicate.')
  if (originalId) {
    if (!DUPLICATE_REVIEW_STATUSES.includes(old.status)) throw new Error('Only unverified review-stage or rejected reports can be marked as duplicates.')
    if (!duplicateOriginals(reports, id).some(r => r.id === originalId)) throw new Error('Choose an existing original that is not rejected or a duplicate.')
    if (reports.some(r => r.duplicateOfReportId === id)) throw new Error('This original report has linked duplicates. Clear their flags first.')
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 5000) throw new Error('Provide a duplicate reason (1-5000 characters).')
  }
  return {
    ...old, isDuplicate: Boolean(originalId), duplicateOfReportId: originalId || null,
    status: originalId ? REPORT_STATUS.REJECTED : REPORT_STATUS.UNDER_REVIEW,
    rejectionReason: originalId ? reason.trim() : null, assignedOfficerId: null,
    verification: { verifiedBy: null, verifiedAt: null }, version: (old.version ?? 1) + 1,
    events: [...(old.events ?? []), { id: crypto.randomUUID(), type: originalId ? 'duplicate_marked' : 'duplicate_cleared',
      fromStatus: old.status, status: originalId ? REPORT_STATUS.REJECTED : REPORT_STATUS.UNDER_REVIEW,
      actorId: actor.id, relatedReportId: originalId || old.duplicateOfReportId,
      message: originalId ? reason.trim() : 'Duplicate flag cleared; report returned to review.', createdAt: now }],
  }
}
