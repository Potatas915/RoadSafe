import { saveReportReview } from './reports.js'

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}
export async function syncPoliceDirectory(client, stations) {
  return rpc(client, 'sync_police_stations', { p_stations: stations.map(({ id, name, address, lat, lng }) => ({ id, name, address, lat, lng })) })
}
export async function loadStationEnforcers(client, stationId) {
  const rows = await rpc(client, 'get_station_enforcers', { p_station: stationId })
  if (!Array.isArray(rows) || rows.some(row => typeof row.id !== 'string' || typeof row.name !== 'string' ||
    ['online','onDuty','busy'].some(key => typeof row[key] !== 'boolean'))) throw new Error('Invalid enforcer roster. Refresh to retry.')
  return rows
}
export const availableEnforcer = row => row.online && row.onDuty && !row.busy
export async function assignStationEnforcer(client, report, stationId, officerId) {
  if (!report || report.status !== 'Verified' || report.assignedOfficerId || report.isDuplicate) throw new Error('Select an unassigned, verified shared report.')
  return rpc(client, 'assign_station_enforcer', { p_id: report.id, p_officer: officerId, p_station: stationId, p_version: report.version })
}
export async function cancelStationEnforcer(client, report) {
  if (!report) throw new Error('Refresh shared reports before cancelling this request.')
  if (!report.assignedOfficerId || !['Assigned', 'In Progress'].includes(report.status)) return
  await saveReportReview(client, report, {
    status: report.status === 'Assigned' ? 'Verified' : 'Under Review',
    assignedOfficerId: null,
    officialRemarks: [report.officialRemarks, 'Police station request cancelled; officer unassigned.'].filter(Boolean).join('\n'),
    rejectionReason: null,
  })
}
