import { demoEvidence } from './demoEvidence.js'
import { REPORT_STATUSES, REPORT_STATUS, ROLES, ACCIDENT_CATEGORIES, VERIFIED_STATUSES, parseReportsResponse } from '../models/report.js'

// One deterministic API-shaped fixture. All web views use App's copy of this response.
const users = [
  { id: 'public-demo', name: 'Demo Reporter', role: ROLES.PUBLIC },
  { id: 'admin-demo', name: 'Demo Administrator', role: ROLES.ADMIN },
  { id: 'officer-mark', name: 'Officer Mark Santos', role: ROLES.OFFICER, unit: 'BL-TM-04', responderType: 'police' },
  { id: 'officer-juan', name: 'Officer Juan Dela Cruz', role: ROLES.OFFICER, unit: 'BL-TM-09', responderType: 'police' },
  { id: 'officer-sara', name: 'Officer Sara Reyes', role: ROLES.OFFICER, unit: 'BL-TM-12', responderType: 'police' },
  { id: 'medic-ana', name: 'Medic Ana Reyes', role: ROLES.OFFICER, unit: 'MED-02', responderType: 'medical' },
  { id: 'medic-paolo', name: 'Medic Paolo Cruz', role: ROLES.OFFICER, unit: 'MED-05', responderType: 'medical' },
  { id: 'ambulance-a1', name: 'Ambulance Unit A-1', role: ROLES.OFFICER, unit: 'AMB-01', responderType: 'medical' },
]
const centers = [
  { longitude: 120.811, latitude: 14.843, count: 14, spread: .014, address: 'McArthur Highway, Malolos, Bulacan' },
  { longitude: 120.901, latitude: 14.954, count: 9, spread: .011, address: 'National Road, Baliuag, Bulacan' },
  { longitude: 120.961, latitude: 14.737, count: 11, spread: .013, address: 'McArthur Highway, Meycauayan, Bulacan' },
  { longitude: 121.045, latitude: 14.814, count: 8, spread: .016, address: 'Quirino Highway, San Jose del Monte, Bulacan' },
  { longitude: 120.857, latitude: 14.886, count: 5, spread: .011, address: 'Plaridel, Bulacan' },
]
let seed = 2026
function random() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function makeReport(index, center, coordinates) {
  const status = index === 0 ? REPORT_STATUS.UNDER_REVIEW : index === 1 ? REPORT_STATUS.VERIFIED : REPORT_STATUSES[(index - 2) % REPORT_STATUSES.length]
  const official = VERIFIED_STATUSES.includes(status)
  const category = ACCIDENT_CATEGORIES[index % ACCIDENT_CATEGORIES.length]
  const day = 10 + index % 7
  return {
    id: `RA-2026-${String(123 + index).padStart(6, '0')}`,
    reporter: { userId: 'public-demo', name: 'Demo Reporter', contact: null },
    occurredAt: `2026-10-${day}T10:00:00+08:00`, submittedAt: `2026-10-${day}T10:05:00+08:00`,
    location: { address: center.address, coordinates }, categoryId: category.id,
    description: `Demo report: ${category.label.toLowerCase()} near ${center.address}. Details await authority review.`,
    vehicles: [{ type: index % 2 ? 'Motorcycle' : 'Car', count: index % 3 === 0 ? 2 : 1 }],
    injuries: index % 3 === 0 ? { status: 'injured', injuredCount: 1, fatalityCount: 0 }
      : index % 3 === 1 ? { status: 'none', injuredCount: 0, fatalityCount: 0 } : { status: 'unknown', injuredCount: null, fatalityCount: null },
    severity: index % 3 === 0 ? 2 : 1, evidence: demoEvidence(index), status,
    assignedOfficerId: ['Assigned', 'In Progress', 'Resolved / Closed'].includes(status) ? index % 2 ? 'officer-mark' : 'officer-juan' : null,
    officialRemarks: official ? 'Demo record reviewed by the traffic desk.' : '',
    verification: { verifiedAt: official ? `2026-10-${day}T10:10:00+08:00` : null, verifiedBy: official ? 'admin-demo' : null },
    rejectionReason: status === REPORT_STATUS.REJECTED ? 'Demo duplicate of an existing report.' : null,
  }
}
const data = [
  makeReport(0, centers[0], { longitude: 120.8114, latitude: 14.8415 }),
  makeReport(1, centers[1], { longitude: 120.9005, latitude: 14.9535 }),
]
for (const center of centers) for (let i = 0; i < center.count; i++) {
  const longitude = center.longitude + (random() + random() + random() - 1.5) * center.spread
  const latitude = center.latitude + (random() + random() + random() - 1.5) * center.spread
  data.push(makeReport(data.length, center, { longitude, latitude }))
}
export const reportsResponse = parseReportsResponse({ data, included: { users }, meta: { schemaVersion: 1 } })
