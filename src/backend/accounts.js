const roles = ['Public', 'Officer', 'Admin']
export function parseAccounts(page) {
  if (!Array.isArray(page?.data) || !Number.isInteger(page.total) || page.total < page.data.length) throw new Error('Invalid account response.')
  const ids = new Set()
  for (const row of page.data) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || !roles.includes(row.role)
      || typeof row.enabled !== 'boolean' || !Number.isInteger(row.version) || row.version < 1
      || !['name','unit'].every(key => typeof row[key] === 'string' && row[key].trim())
      || !['police','medical'].includes(row.responderType)
      || (row.station != null && (typeof row.station !== 'object' || typeof row.station.id !== 'string' || !row.station.id.trim() || typeof row.station.name !== 'string' || !row.station.name.trim() || typeof row.station.address !== 'string'))
      || !(row.username === null || typeof row.username === 'string')) throw new Error('Invalid account response.')
    ids.add(row.id)
  }
  return page
}
export async function loadAccounts(client, search = '', offset = 0) {
  const { data, error } = await client.rpc('list_accounts', { p_search: search.trim(), p_offset: offset, p_limit: 50 })
  if (error) throw error
  return parseAccounts(data)
}
export async function saveAccount(client, account, patch, reason) {
  const { data, error } = await client.rpc('manage_account', {
    p_id: account.id, p_name: patch.name.trim(), p_responder_type: patch.responderType,
    p_role: patch.role, p_enabled: patch.enabled, p_version: account.version, p_reason: reason.trim(),
    p_station_id: patch.stationId === undefined ? account.station?.id ?? null : patch.stationId,
    p_expected_station_id: account.station?.id ?? null, p_verify: patch.verify === true,
  })
  if (error) throw error
  return parseAccounts({ data: [data], total: 1 }).data[0]
}

export async function loadAccountStations(client) {
  const { data, error } = await client.rpc('get_login_stations')
  if (error) throw error
  if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim() || typeof row.address !== 'string')) throw new Error('Invalid station directory. Refresh to retry.')
  return data
}
