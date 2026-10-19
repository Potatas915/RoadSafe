import { ACCIDENT_CATEGORIES } from '../models/report.js'

export function parseCategories(rows) {
  if (!Array.isArray(rows) || rows.length !== ACCIDENT_CATEGORIES.length) throw new Error('Category catalog is incomplete.')
  return ACCIDENT_CATEGORIES.map(base => {
    const row = rows.find(row => row.id === base.id)
    if (!row || rows.filter(item => item.id === base.id).length !== 1 || typeof row.label !== 'string' ||
        !row.label.trim() || row.label.length > 60 || /[\u0000-\u001f\u007f]/.test(row.label) ||
        typeof row.enabled !== 'boolean' || !Number.isInteger(row.version) || row.version < 1) throw new Error('Invalid category catalog.')
    return { ...base, label: row.label, enabled: row.enabled, version: row.version }
  })
}
export async function loadCategories(client) {
  const { data, error } = await client.from('accident_categories').select('id,label,enabled,version')
  if (error) throw error
  return parseCategories(data)
}
export async function saveCategory(client, category, patch) {
  const { data, error } = await client.rpc('update_accident_category', {
    p_id: category.id, p_label: patch.label, p_enabled: patch.enabled, p_version: category.version,
  })
  if (error?.code === '23505') throw new Error('Another category already uses that name.')
  if (error) throw error
  return data
}
