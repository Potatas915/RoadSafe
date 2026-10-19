import { categoryLabel, formatDateTime, reportSummary, REPORT_STATUSES, ACCIDENT_CATEGORIES } from '../models/report.js'

export function manilaDay(value) {
  if (value === null || value === undefined || value === '') return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type) => parts.find((p) => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function timeframeRange(timeframe, now = new Date()) {
  const today = manilaDay(now)
  const [year, month] = today.split('-').map(Number)
  if (timeframe === 'day') return { start: today, end: today }
  if (timeframe === 'week') { const start = periodStart(today, 'week'); return { start, end: periodEnd(start, 'week') } }
  if (timeframe === 'annual') return { start: `${year}-01-01`, end: `${year}-12-31` }
  if (timeframe === 'month') return { start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) }
  if (timeframe === 'quarter') {
    const startMonth = Math.floor((month - 1) / 3) * 3 - 3
    return { start: new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10) }
  }
  if (timeframe === 'year') return { start: `${year}-01-01`, end: today }
  return { start: '', end: '' }
}

export const DATE_BASES = Object.freeze({ occurredAt: 'Incident date', submittedAt: 'Submission date' })
export const PERIOD_GROUPS = Object.freeze({ day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Annual' })
const calendarDate = (day) => new Date(`${day}T00:00:00Z`)
const dayString = (date) => date.toISOString().slice(0, 10)
function validDay(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(calendarDate(day).getTime()) && dayString(calendarDate(day)) === day
}
export function dateRangeError({ start = '', end = '' }, requireBoth = false) {
  if (requireBoth && (!start || !end)) return 'Choose both dates.'
  if (start && !validDay(start) || end && !validDay(end)) return 'Choose valid calendar dates.'
  return start && end && start > end ? 'End date must be on or after start date.' : ''
}
function periodStart(day, groupBy) {
  const date = calendarDate(day)
  if (groupBy === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  if (groupBy === 'month') date.setUTCDate(1)
  if (groupBy === 'year') { date.setUTCMonth(0); date.setUTCDate(1) }
  return dayString(date)
}
function periodEnd(start, groupBy) {
  const date = calendarDate(start)
  if (groupBy === 'week') date.setUTCDate(date.getUTCDate() + 6)
  if (groupBy === 'month') { date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0) }
  if (groupBy === 'year') date.setUTCMonth(11, 31)
  return dayString(date)
}
function nextDay(day) { const date = calendarDate(day); date.setUTCDate(date.getUTCDate() + 1); return dayString(date) }

export function filterReportsByDate(reports, { start = '', end = '' } = {}, dateField = 'occurredAt') {
  if (!Object.hasOwn(DATE_BASES, dateField)) throw new Error('Unknown date basis.')
  if (dateRangeError({ start, end })) return []
  return reports.filter((r) => {
    const day = manilaDay(r[dateField])
    return day && (!start || day >= start) && (!end || day <= end)
  })
}
export function filterExportReports(reports, range, dateField = 'occurredAt') {
  return filterReportsByDate(reports, range, dateField).sort((a, b) => Date.parse(a[dateField]) - Date.parse(b[dateField]) || a.id.localeCompare(b.id))
}

export function groupReportPeriods(reports, range = {}, groupBy = 'day', dateField = 'occurredAt') {
  if (!Object.hasOwn(PERIOD_GROUPS, groupBy)) throw new Error('Unknown period grouping.')
  const selected = filterExportReports(reports, range, dateField)
  if (dateRangeError(range)) return []
  const start = range.start || manilaDay(selected[0]?.[dateField])
  const end = range.end || manilaDay(selected.at(-1)?.[dateField])
  if (!start || !end || start > end) return []
  const buckets = new Map()
  for (const report of selected) {
    const key = periodStart(manilaDay(report[dateField]), groupBy)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(report)
  }
  const rows = []
  for (let cursor = periodStart(start, groupBy); cursor <= end;) {
    const last = periodEnd(cursor, groupBy)
    rows.push({ start: cursor < start ? start : cursor, end: last > end ? end : last, ...reportSummary(buckets.get(cursor) ?? []) })
    if (last >= end) break
    cursor = nextDay(last)
  }
  return rows
}

export function exportRows(reports, users = [], categories = ACCIDENT_CATEGORIES) {
  return reports.map((r) => [r.id, formatDateTime(r.occurredAt), formatDateTime(r.submittedAt), categoryLabel(r.categoryId, categories), r.status,
    r.location.address ?? '', r.location.coordinates?.latitude ?? '', r.location.coordinates?.longitude ?? '', r.description,
    r.injuries.status, r.injuries.injuredCount ?? 'Unknown', r.injuries.fatalityCount ?? 'Unknown',
    users.find((u) => u.id === r.assignedOfficerId)?.name ?? 'Unassigned', r.officialRemarks])
}
export const exportHeaders = ['Reference', 'Incident time (Asia/Manila)', 'Submitted time (Asia/Manila)', 'Category', 'Status', 'Location', 'Latitude', 'Longitude', 'Description', 'Injury status', 'Injured', 'Fatalities', 'Assigned officer', 'Official remarks']

function csvDocument(rows) {
  const cell = (value) => {
    let text = String(value)
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}
export function createCsv(reports, users, categories = ACCIDENT_CATEGORIES) {
  return csvDocument([exportHeaders, ...exportRows(reports, users, categories)])
}
export function createSummaryCsv(reports, { range, groupBy = 'day', dateField = 'occurredAt', source = '' }) {
  const rows = groupReportPeriods(reports, range, groupBy, dateField)
  return csvDocument([
    ['Date basis (Asia/Manila)', 'Grouping', 'Source', 'Period start', 'Period end', 'Total reports', 'Pending review', 'Verified (includes closed)', 'Closed'],
    ...rows.map((r) => [DATE_BASES[dateField], PERIOD_GROUPS[groupBy], source, r.start, r.end, r.total, r.pending, r.verified, r.closed]),
  ])
}

export async function createPdf(reports, users, { period, source, fontBase64, range, groupBy, dateField = 'occurredAt', categories = ACCIDENT_CATEGORIES }) {
  if (range) reports = filterExportReports(reports, range, dateField)
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
  line(`Filtered by ${DATE_BASES[dateField].toLowerCase()} in Asia/Manila; range endpoints are inclusive.`)
  y += 4
  const summary = reportSummary(reports)
  line(`Total: ${summary.total} | Pending review: ${summary.pending} | Verified: ${summary.verified} | Closed: ${summary.closed}`, 11)
  line('By status', 12)
  for (const status of REPORT_STATUSES) line(`${status}: ${reports.filter((r) => r.status === status).length}`)
  line('By category', 12)
  for (const category of categories) line(`${category.label}: ${reports.filter((r) => r.categoryId === category.id).length}`)
  if (groupBy) {
    line(`${PERIOD_GROUPS[groupBy]} period summary`, 12)
    line('Weeks: Monday-Sunday. Boundary periods show only selected dates. Verified includes closed reports.', 9)
    const rows = groupReportPeriods(reports, range, groupBy, dateField)
    if (!rows.length) line('No periods to summarize.')
    for (const row of rows) line(`${row.start} to ${row.end} | Total ${row.total} | Pending ${row.pending} | Verified ${row.verified} | Closed ${row.closed}`, 9)
  }
  line('Report records', 12)
  if (!reports.length) line('No reports match this timeframe.')
  for (const row of exportRows(reports, users, categories)) {
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
