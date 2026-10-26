import { hasActiveOfficer } from '../data/responders.js'

export function demoStationEnforcers(users, reports) {
  return users.filter(user => user.role === 'Officer' && user.responderType === 'police' && user.enabled !== false)
    .map(user => ({ ...user, online: true, onDuty: true,
      busy: reports.some(report => hasActiveOfficer(report) && report.assignedOfficerId === user.id) }))
}

export function demoAssignmentPatch(users, reports, reportId, officerId) {
  const report = reports.find(row => row.id === reportId)
  if (!report || report.status !== 'Verified' || report.assignedOfficerId || report.isDuplicate) throw new Error('Select an unassigned, verified report.')
  if (!demoStationEnforcers(users, reports).some(row => row.id === officerId && !row.busy)) throw new Error('Choose an available enforcer.')
  return { status: 'Assigned', assignedOfficerId: officerId, officialRemarks: report.officialRemarks, rejectionReason: null }
}
