import { REPORT_STATUS as S } from './report.js'
import { caseSeverity } from './caseSeverity.js'

export const REPORT_QUEUES = [
  ['all', 'All', () => true],
  ['review', 'Awaiting review', r => [S.SUBMITTED, S.UNDER_REVIEW].includes(r.status)],
  ['information', 'Needs information', r => r.status === S.INFORMATION_REQUIRED],
  ['unassigned', 'Verified–unassigned', r => r.status === S.VERIFIED && !r.assignedOfficerId],
  ['active', 'Assigned / In progress', r => [S.ASSIGNED, S.IN_PROGRESS].includes(r.status)],
  ['closed', 'Closed', r => r.status === S.CLOSED],
  ['rejected', 'Rejected', r => r.status === S.REJECTED],
]

export function lastReportUpdate(report) {
  return Math.max(Date.parse(report.submittedAt), ...(report.events ?? []).map(e => Date.parse(e.createdAt)).filter(Number.isFinite))
}

export function sortReportQueue(reports, sort) {
  return [...reports].sort((a, b) => {
    const delta = sort === 'oldest' ? Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
      : sort === 'severity' ? (caseSeverity(b).score ?? -1) - (caseSeverity(a).score ?? -1)
      : sort === 'updated' ? lastReportUpdate(b) - lastReportUpdate(a)
      : Date.parse(b.submittedAt) - Date.parse(a.submittedAt)
    return delta || a.id.localeCompare(b.id)
  })
}
