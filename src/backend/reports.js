import { parseReportsResponse } from '../models/report.js'

export async function loadReportFeed(client) {
  const { data, error } = await client.rpc('get_report_feed')
  if (error) throw error
  const response = structuredClone(data)
  const files = response.data.flatMap((report) => report.evidence)
  if (files.length) {
    const { data: links, error: linkError } = await client.storage.from('accident-evidence')
      .createSignedUrls(files.map((file) => file.storagePath), 600)
    if (linkError) throw linkError
    const urls = new Map(links.map((link) => [link.path, link.signedUrl ?? null]))
    for (const file of files) file.url = urls.get(file.storagePath) ?? null
  }
  return parseReportsResponse(response)
}

export async function saveReportReview(client, report, patch) {
  const { error } = await client.rpc('update_accident_report', {
    p_id: report.id, p_status: patch.status, p_officer: patch.assignedOfficerId,
    p_remarks: patch.officialRemarks, p_reason: patch.rejectionReason,
    p_version: report.version,
  })
  if (error) throw error
}

export async function saveReportDuplicate(client, report, originalId, reason) {
  const { error } = await client.rpc('set_report_duplicate', {
    p_id: report.id, p_original: originalId || null, p_reason: reason?.trim() || null, p_version: report.version,
  })
  if (error) throw error
}

export async function saveReportCorrection(client, report, values, reason) {
  const { error } = await client.rpc('correct_accident_report', {
    p_id: report.id, p_values: values, p_reason: reason.trim(), p_version: report.version,
  })
  if (error) throw error
}
