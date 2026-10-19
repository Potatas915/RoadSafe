const roles = ['Public', 'Officer', 'Admin']
export function parseAccounts(page) {
  if (!Array.isArray(page?.data) || !Number.isInteger(page.total) || page.total < page.data.length) throw new Error('Invalid account response.')
  const ids = new Set()
  for (const row of page.data) {
    if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id) || !roles.includes(row.role)
      || typeof row.enabled !== 'boolean' || !Number.isInteger(row.version) || row.version < 1
      || !['name','unit'].every(key => typeof row[key] === 'string' && row[key].trim())
      || !['police','medical'].includes(row.responderType)
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
  const { data, error } = await client.rpc('update_account', {
    p_id: account.id, p_name: patch.name.trim(), p_unit: patch.unit.trim(), p_responder_type: patch.responderType,
    p_role: patch.role, p_enabled: patch.enabled, p_version: account.version, p_reason: reason.trim(),
  })
  if (error) throw error
  return parseAccounts({ data: [data], total: 1 }).data[0]
}
