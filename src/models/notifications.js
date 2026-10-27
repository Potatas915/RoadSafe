import { REPORT_STATUS } from './report.js'

// Use persisted report events, so refreshes and changes made while signed out
// produce the same notification IDs. Store only read IDs in browser storage.
export function reportNotifications(reports) {
  const notifications = []
  for (const report of reports) {
    const reference = report.reference || report.id
    notifications.push({ id: `submission:${report.id}`, reportId: report.id,
      title: 'Submission confirmed', message: `${reference}: accident report received and awaiting review.`,
      createdAt: report.submittedAt })
    let previousStatus = REPORT_STATUS.SUBMITTED
    const events = [...(report.events ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    for (const event of events) {
      if (!event.status) continue
      const fromStatus = event.fromStatus ?? previousStatus
      if (event.status !== fromStatus) {
        notifications.push({ id: `status:${report.id}:${event.id}`, reportId: report.id,
          title: 'Report status changed', message: `${reference}: ${fromStatus} → ${event.status}.`, createdAt: event.createdAt })
      }
      previousStatus = event.status
    }
  }
  return notifications.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id))
}

export function notificationStorageKey(accountId) {
  return `roadsafe:notifications:read:v1:${accountId}`
}

export function enforcerNotifications(accounts) {
  return accounts.filter(account => account.requestedAccountType === 'Officer').map(account => ({
    id: `enforcer-registration:${account.id}`, accountId: account.id,
    title: 'Enforcer account created', message: `${account.name} registered as an enforcer. Open Account Management to review the account.`,
  }))
}

export function loadReadNotifications(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch { return [] }
}
