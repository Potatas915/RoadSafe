import { categoryLabel, formatDateTime, reportSummary, REPORT_STATUSES, ACCIDENT_CATEGORIES } from '../models/report.js'

export function manilaDay(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type) => parts.find((p) => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function timeframeRange(timeframe, now = new Date()) {
  const today = manilaDay(now)
  const [year, month] = today.split('-').map(Number)
  if (timeframe === 'month') return { start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) }
  if (timeframe === 'quarter') {
    const startMonth = Math.floor((month - 1) / 3) * 3 - 3
    return { start: new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10) }
  }
  if (timeframe === 'year') return { start: `${year}-01-01`, end: today }
  return { start: '', end: '' }
}

export function filterExportReports(reports, { start, end }) {
  return reports.filter((r) => {
    const day = manilaDay(r.occurredAt)
    return day && (!start || day >= start) && (!end || day <= end)
  }).sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id))
}

export function exportRows(reports, users = []) {
  return reports.map((r) => [r.id, formatDateTime(r.occurredAt), formatDateTime(r.submittedAt), categoryLabel(r.categoryId), r.status,
    r.location.address ?? '', r.location.coordinates?.latitude ?? '', r.location.coordinates?.longitude ?? '', r.description,
    r.injuries.status, r.injuries.injuredCount ?? 'Unknown', r.injuries.fatalityCount ?? 'Unknown',
    users.find((u) => u.id === r.assignedOfficerId)?.name ?? 'Unassigned', r.officialRemarks])
}
export const exportHeaders = ['Reference', 'Incident time (Asia/Manila)', 'Submitted time (Asia/Manila)', 'Category', 'Status', 'Location', 'Latitude', 'Longitude', 'Description', 'Injury status', 'Injured', 'Fatalities', 'Assigned officer', 'Official remarks']

export function createCsv(reports, users) {
  const cell = (value) => {
    let text = String(value)
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + [exportHeaders, ...exportRows(reports, users)].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export async function createPdf(reports, users, { period, source, fontBase64 }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  if (!fontBase64) {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/Vera.ttf`)
    if (!response.ok) throw new Error('PDF font unavailable')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    fontBase64 = btoa(binary)
  }
  doc.addFileToVFS('Vera.ttf', fontBase64)
  doc.addFont('Vera.ttf', 'Vera', 'normal')
  doc.setFont('Vera')
  let y = 20
  const line = (text, size = 10) => {
    doc.setFontSize(size)
    for (const part of doc.splitTextToSize(String(text), 174)) {
      if (y > 275) { doc.addPage(); y = 20 }
      doc.text(part, 18, y); y += size * 0.45 + 1
    }
  }
  line('RoadSafe - Accident Report', 18)
  line(period); line(`Source: ${source}`)
  line(`Generated: ${formatDateTime(new Date().toISOString())} (Asia/Manila)`)
  line('Filtered by incident date; range endpoints are inclusive.')
  y += 4
  const summary = reportSummary(reports)
  line(`Total: ${summary.total} | Pending review: ${summary.pending} | Verified: ${summary.verified} | Closed: ${summary.closed}`, 11)
  line('By status', 12)
  for (const status of REPORT_STATUSES) line(`${status}: ${reports.filter((r) => r.status === status).length}`)
  line('By category', 12)
  for (const category of ACCIDENT_CATEGORIES) line(`${category.label}: ${reports.filter((r) => r.categoryId === category.id).length}`)
  line('Report records', 12)
  if (!reports.length) line('No reports match this timeframe.')
  for (const row of exportRows(reports, users)) {
    y += 5
    if (y > 240) { doc.addPage(); y = 20 }
    line(row[0], 12)
    for (const [index, value] of row.entries()) if (index) line(`${exportHeaders[index]}: ${value === '' ? '-' : value}`)
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(9); doc.text(`RoadSafe | Page ${page} of ${pages}`, 18, 289)
  }
  return doc.output('blob')
}

export function downloadExport(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename
  document.body.appendChild(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
