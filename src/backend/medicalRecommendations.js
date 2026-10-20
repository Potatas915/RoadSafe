export async function getMedicalRecommendation(client, reportId) {
  const { data, error } = await client.rpc('get_medical_recommendation', { p_id: reportId })
  if (error) throw error
  return data
}

export async function saveMedicalRecommendation(client, report, selectedId, facilities) {
  if (!report || report.sample) throw new Error('Choose a shared report to send information to its Officer.')
  const { data, error } = await client.rpc('set_medical_recommendation', {
    p_id: report.id, p_version: report.version, p_selected: selectedId,
    p_facilities: facilities.map(({ id, name, kind, address, lat, lng }) => ({ id, name, kind, address, lat, lng })),
  })
  if (error) throw error
  return data
}
