import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { timeframeRange, filterExportReports, createCsv, createPdf } from '../src/services/reportExport.js'
import { reportsResponse } from '../src/data/reports.js'

test('timeframes use Manila calendar boundaries including previous year and leap day', () => {
  assert.deepEqual(timeframeRange('month', new Date('2026-09-30T16:00:00Z')), { start: '2026-10-01', end: '2026-10-31' })
  assert.deepEqual(timeframeRange('quarter', new Date('2026-01-20T00:00:00Z')), { start: '2025-10-01', end: '2025-12-31' })
  assert.deepEqual(timeframeRange('month', new Date('2024-02-10T00:00:00Z')), { start: '2024-02-01', end: '2024-02-29' })
  assert.deepEqual(timeframeRange('year', new Date('2025-12-31T16:00:00Z')), { start: '2026-01-01', end: '2026-01-01' })
})
test('filter includes both Manila endpoints, uses occurrence not submission, and preserves input', () => {
  const reports = ['2026-10-31T16:00:00Z', '2026-09-30T16:00:00Z', '2026-10-31T15:59:59Z', '2026-09-30T15:59:59Z'].map((occurredAt, id) => ({ id: String(id), occurredAt, submittedAt: '2027-01-01T00:00:00Z' }))
  assert.deepEqual(filterExportReports(reports, { start: '2026-10-01', end: '2026-10-31' }).map((r) => r.id), ['1', '2'])
  assert.equal(reports[0].id, '0')
  assert.equal(filterExportReports(reports, { start: '', end: '' }).length, 4)
})
test('CSV preserves Unicode/quotes/newlines, neutralizes formulas, and handles empty data', () => {
  const report = structuredClone(reportsResponse.data[0])
  report.description = 'Baliuag, "Peña"\nsecond line'
  report.officialRemarks = '  =HYPERLINK("evil")'
  report.injuries.injuredCount = null
  const csv = createCsv([report], [])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"Baliuag, ""Peña""\nsecond line"'))
  assert.ok(csv.includes('"\'  =HYPERLINK(""evil"")"'))
  assert.ok(csv.includes('"Unknown"'))
  assert.equal(createCsv([], []).split('\r\n').length, 2)
})
test('PDF produces real paginated files and empty summaries', async () => {
  const fontBase64 = readFileSync(new URL('../public/fonts/Vera.ttf', import.meta.url)).toString('base64')
  const options = { period: 'All time', source: 'Demo', fontBase64 }
  for (const reports of [[], reportsResponse.data]) {
    const blob = await createPdf(reports, reportsResponse.included.users, options)
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')
    assert.ok(text.startsWith('%PDF-'))
    const pages = Number(text.match(/\/Type \/Pages\s*\/Kids[^]*?\/Count (\d+)/)?.[1])
    assert.ok(pages >= (reports.length ? 2 : 1))
  }
})
