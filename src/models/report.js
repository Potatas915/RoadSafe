import { caseSeverity } from './caseSeverity.js'
import { highlightRadius } from '../services/affectedStreets.js'
// API contract v1. Labels are stored verbatim in report.status; IDs stay stable.
export const REPORT_STATUS = Object.freeze({
  SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review',
  INFORMATION_REQUIRED: 'Additional Information Required', VERIFIED: 'Verified',
  ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  CLOSED: 'Resolved / Closed', REJECTED: 'Rejected',
})
export const REPORT_STATUSES = Object.freeze(Object.values(REPORT_STATUS))
export const ROLES = Object.freeze({ PUBLIC: 'Public', ADMIN: 'Admin', OFFICER: 'Officer' })
export const ACCIDENT_CATEGORIES = Object.freeze([
  { id: 'collision', label: 'Collision', color: '#ef4444' },
  { id: 'hit-and-run', label: 'Hit-and-run', color: '#f59e0b' },
  { id: 'rollover', label: 'Vehicle rollover', color: '#a78bfa' },
  { id: 'pedestrian', label: 'Pedestrian accident', color: '#38bdf8' },
  { id: 'other', label: 'Other accident', color: '#94a3b8' },
])
export const INJURY_STATUSES = Object.freeze(['unknown', 'none', 'injured', 'fatal'])
export const VERIFIED_STATUSES = Object.freeze([
  REPORT_STATUS.VERIFIED, REPORT_STATUS.ASSIGNED, REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.CLOSED,
])
export const categoryLabel = (id) => ACCIDENT_CATEGORIES.find((c) => c.id === id)?.label ?? id
export const isOfficiallyVerified = (report) => Boolean(report.verification.verifiedAt && report.verification.verifiedBy)
export const officerName = (users, id) => users.find((user) => user.id === id)?.name ?? 'Unassigned'
export const formatDateTime = (value) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(new Date(value))

/**
 * @typedef {Object} AccidentReport
 * @property {string} id Server-generated, immutable report identifier.
 * @property {{userId: string|null, name: string|null, contact: string|null}} reporter Policy-dependent identity.
 * @property {string} occurredAt ISO-8601 timestamp with timezone (incident date/time).
 * @property {{address: string, coordinates: {longitude:number, latitude:number}|null}} location
 * @property {string} categoryId One of ACCIDENT_CATEGORIES IDs.
 * @property {string} description Required incident narrative.
 * @property {Array<{type:string, count:number}>} vehicles Empty when not applicable.
 * @property {{status:string, injuredCount:number|null, fatalityCount:number|null}} injuries Unknown counts are null.
 * @property {number} severity 1=minor, 2=injury, 3=serious/fatal (heatmap weight only).
 * @property {Array<{id:string, fileName:string, url:string, mimeType:string}>} evidence Optional attachments.
 * @property {string} status One of REPORT_STATUSES.
 * @property {string} submittedAt ISO-8601 server timestamp.
 * @property {string|null} assignedOfficerId Reference to an Officer user.
 * @property {string} officialRemarks Empty until official findings are recorded.
 * @property {{verifiedAt:string|null, verifiedBy:string|null}} verification Independent verification provenance.
 * @property {string|null} rejectionReason Required for Rejected.
 */
const text = (value) => typeof value === 'string' && value.trim().length > 0
const nullableText = (value) => value === null || text(value)
const isoDate = (value) => text(value) && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
const count = (value) => Number.isInteger(value) && value >= 0
export function validCoordinates(coordinates) {
  return coordinates && typeof coordinates.longitude === 'number' && Number.isFinite(coordinates.longitude)
    && Math.abs(coordinates.longitude) <= 180 && typeof coordinates.latitude === 'number'
    && Number.isFinite(coordinates.latitude) && Math.abs(coordinates.latitude) <= 90
}
export function validateReport(report) {
  const errors = []
  if (!report || typeof report !== 'object') return ['Report must be an object.']
  if (!text(report.id)) errors.push('Report ID is required.')
  if (!isoDate(report.occurredAt) || !isoDate(report.submittedAt)) errors.push('Incident and submission timestamps must include a timezone.')
  if (!nullableText(report.location?.address) || (!report.location?.address && !validCoordinates(report.location?.coordinates))) errors.push('An address or valid confirmed coordinates are required.')
  if (report.location?.coordinates !== null && !validCoordinates(report.location?.coordinates)) errors.push('Coordinates must be numbers in range or null.')
  if (!ACCIDENT_CATEGORIES.some((c) => c.id === report.categoryId)) errors.push('Unknown accident category.')
  if (!text(report.description)) errors.push('Description is required.')
  if (!REPORT_STATUSES.includes(report.status)) errors.push('Unknown report status.')
  if (!Number.isInteger(report.severity) || report.severity < 1 || report.severity > 3) errors.push('Severity must be 1, 2 or 3.')
  if (!report.reporter || !['userId', 'name', 'contact'].every((key) => nullableText(report.reporter[key]))) errors.push('Reporter fields must be nonempty strings or null.')
  if (!Array.isArray(report.vehicles) || report.vehicles.some((v) => !v || !text(v.type) || !Number.isInteger(v.count) || v.count < 1)) errors.push('Vehicles require a type and positive count.')
  const injury = report.injuries
  if (!injury || !INJURY_STATUSES.includes(injury.status) || !['injuredCount', 'fatalityCount'].every((key) => injury[key] === null || count(injury[key]))) errors.push('Invalid injury information.')
  else if (injury.status === 'unknown' && (injury.injuredCount !== null || injury.fatalityCount !== null)
    || injury.status === 'none' && (injury.injuredCount !== 0 || injury.fatalityCount !== 0)
    || injury.status === 'injured' && (injury.injuredCount !== null && (!count(injury.injuredCount) || injury.injuredCount < 1) || injury.fatalityCount !== 0)
    || injury.status === 'fatal' && (injury.fatalityCount !== null && (!count(injury.fatalityCount) || injury.fatalityCount < 1))) errors.push('Injury counts do not match injury status.')
  if (!Array.isArray(report.evidence) || report.evidence.some((e) => !e || !text(e.id) || !text(e.fileName) || !text(e.mimeType) || !(e.url === null && text(e.storagePath) || text(e.url) && /^(https?:\/\/|\/(?!\/))/.test(e.url)))) errors.push('Evidence needs an ID, filename, MIME type and safe URL.')
  if (!nullableText(report.assignedOfficerId)) errors.push('Invalid assigned officer.')
  if (typeof report.officialRemarks !== 'string') errors.push('Official remarks must be a string.')
  const verification = report.verification
  if (!verification || !(verification.verifiedAt === null && verification.verifiedBy === null
    || isoDate(verification.verifiedAt) && text(verification.verifiedBy))) errors.push('Verification requires both verifier and timestamp, or both null.')
  if (VERIFIED_STATUSES.includes(report.status) && !verification?.verifiedAt) errors.push('This status requires official verification.')
  if ([REPORT_STATUS.ASSIGNED, REPORT_STATUS.IN_PROGRESS].includes(report.status) && !report.assignedOfficerId) errors.push('This status requires an assigned officer.')
  if (!nullableText(report.rejectionReason) || report.status === REPORT_STATUS.REJECTED && !text(report.rejectionReason)) errors.push('Rejected reports require a reason.')
  return errors
}

// GET reports response: { data: AccidentReport[], included: { users: User[] }, meta: { schemaVersion: 1 } }
export function parseReportsResponse(response) {
  if (response?.meta?.schemaVersion !== 1 || !Array.isArray(response.data) || !Array.isArray(response.included?.users)) throw new Error('Expected reports API contract v1.')
  const users = response.included.users
  const ids = new Set()
  for (const user of users) {
    if (!user || !text(user.id) || ids.has(user.id) || !text(user.name) || !Object.values(ROLES).includes(user.role)) throw new Error('Invalid or duplicate user.')
    if (user.role === ROLES.OFFICER && (!text(user.unit) || !['police', 'medical'].includes(user.responderType))) throw new Error('Officer requires unit and responder type.')
    ids.add(user.id)
  }
  const reportIds = new Set()
  for (const report of response.data) {
    const errors = validateReport(report)
    if (errors.length) throw new Error(`${report?.id ?? 'Report'}: ${errors.join(' ')}`)
    if (reportIds.has(report.id)) throw new Error('Duplicate report ID.')
    reportIds.add(report.id)
    if (report.reporter.userId && !users.some((u) => u.id === report.reporter.userId && u.role === ROLES.PUBLIC)) throw new Error('Unknown public reporter.')
    if (report.assignedOfficerId && !users.some((u) => u.id === report.assignedOfficerId && u.role === ROLES.OFFICER)) throw new Error('Unknown assigned officer.')
    if (report.verification.verifiedBy && !users.some((u) => u.id === report.verification.verifiedBy && [ROLES.ADMIN, ROLES.OFFICER].includes(u.role))) throw new Error('Unknown authorized verifier.')
  }
  return response
}

// Presentation-only adapter; never place reporter contact/evidence into map features.
export function reportsToGeoJSON(reports) {
  return { type: 'FeatureCollection', features: reports.filter((r) => validCoordinates(r.location.coordinates)).map((r) => ({
    type: 'Feature', id: r.id,
    geometry: { type: 'Point', coordinates: [r.location.coordinates.longitude, r.location.coordinates.latitude] },
    properties: { id: r.id, _reportId: r.id, reportType: r.categoryId, severity: r.severity,
      _severityWeight: r.severity, caseColor: caseSeverity(r).color, caseScore: caseSeverity(r).score,
      _accidentRadiusPixels0: highlightRadius(0, r.location.coordinates.latitude),
      status: r.status, verified: isOfficiallyVerified(r), description: r.description },
  })) }
}
export function reportSummary(reports) {
  return { total: reports.length, pending: reports.filter((r) => [REPORT_STATUS.SUBMITTED, REPORT_STATUS.UNDER_REVIEW, REPORT_STATUS.INFORMATION_REQUIRED].includes(r.status)).length,
    verified: reports.filter(isOfficiallyVerified).length, closed: reports.filter((r) => r.status === REPORT_STATUS.CLOSED).length }
}
export function updateReport(report, patch, actorId, now = new Date().toISOString()) {
  const next = { ...report, status: patch.status, assignedOfficerId: patch.assignedOfficerId,
    officialRemarks: patch.officialRemarks, rejectionReason: patch.status === REPORT_STATUS.REJECTED ? patch.rejectionReason : null }
  // Verification survives later workflow states, but returning to review clears it.
  next.verification = VERIFIED_STATUSES.includes(next.status)
    ? isOfficiallyVerified(report) ? report.verification : { verifiedAt: now, verifiedBy: actorId }
    : { verifiedAt: null, verifiedBy: null }
  const errors = validateReport(next)
  if (errors.length) throw new Error(errors.join(' '))
  return next
}

