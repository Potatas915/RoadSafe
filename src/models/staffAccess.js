export const canUseManager = account => Boolean(account?.enabled && ['Admin','Officer'].includes(account.role))
export const isVerificationCase = (report, officerId) => !report.isDuplicate && !report.assignedOfficerId
  && report.reporter.userId !== officerId && ['Submitted','Under Review','Additional Information Required'].includes(report.status)
export function officerCases(reports, officerId) {
  return {
    verification: reports.filter(report => isVerificationCase(report, officerId)),
    assignments: reports.filter(report => report.assignedOfficerId === officerId && ['Assigned','In Progress'].includes(report.status)),
  }
}
export function officerStatuses(report, officerId) {
  if (isVerificationCase(report, officerId)) return ['Verified']
  if (report.assignedOfficerId !== officerId) return []
  return report.status === 'Assigned' ? ['Assigned','In Progress'] : report.status === 'In Progress' ? ['In Progress','Resolved / Closed'] : []
}
