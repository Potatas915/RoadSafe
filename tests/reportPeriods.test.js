import test from 'node:test'
import assert from 'node:assert/strict'
import { reportsResponse } from '../src/data/reports.js'
import { reportSummary } from '../src/models/report.js'
import { timeframeRange, dateRangeError, filterReportsByDate, filterExportReports, groupReportPeriods, createSummaryCsv } from '../src/services/reportExport.js'

const report = (id, occurredAt, submittedAt = occurredAt) => ({ ...structuredClone(reportsResponse.data[0]), id, occurredAt, submittedAt })

test('today, Monday-Sunday week and full-year presets use the Manila calendar', () => {
  assert.deepEqual(timeframeRange('day', new Date('2026-10-18T16:00:00Z')), { start: '2026-10-19', end: '2026-10-19' })
  assert.deepEqual(timeframeRange('week', new Date('2023-12-31T16:00:00Z')), { start: '2024-01-01', end: '2024-01-07' })
  assert.deepEqual(timeframeRange('week', new Date('2024-01-07T15:59:59Z')), { start: '2024-01-01', end: '2024-01-07' })
  assert.deepEqual(timeframeRange('annual', new Date('2025-12-31T16:00:00Z')), { start: '2026-01-01', end: '2026-12-31' })
})

test('date ranges reject reversals and impossible dates, allow open report-list boundaries', () => {
  assert.equal(dateRangeError({ start: '', end: '' }), '')
  assert.equal(dateRangeError({ start: '2024-02-29', end: '' }), '')
  assert.ok(dateRangeError({ start: '2025-02-29', end: '' }))
  assert.ok(dateRangeError({ start: '2026-11-01', end: '2026-10-31' }))
  assert.ok(dateRangeError({ start: '2026-10-01', end: '' }, true))
  assert.deepEqual(filterExportReports([report('a', '2026-10-01T00:00:00Z')], { start: 'bad' }), [])
})

test('report-list date filtering preserves ordering and combines inclusive boundaries with either basis', () => {
  const reports = [report('end', '2026-10-31T15:59:59.999Z', '2026-11-01T00:00:00Z'), report('start', '2026-09-30T16:00:00Z', '2026-10-02T00:00:00Z'), report('outside', '2026-09-30T15:59:59.999Z')]
  const range = { start: '2026-10-01', end: '2026-10-31' }
  assert.deepEqual(filterReportsByDate(reports, range).map(r => r.id), ['end', 'start'])
  assert.deepEqual(filterReportsByDate(reports, range, 'submittedAt').map(r => r.id), ['start'])
  assert.deepEqual(filterReportsByDate(reports, { end: '2026-09-30' }).map(r => r.id), ['outside'])
  assert.deepEqual(reports.map(r => r.id), ['end', 'start', 'outside'])
})

test('daily summaries include leap-day zeros and trim weekly boundary periods', () => {
  const reports = [report('a', '2024-02-28T00:00:00Z'), report('b', '2024-03-01T00:00:00Z')]
  const range = { start: '2024-02-28', end: '2024-03-02' }
  const daily = groupReportPeriods(reports, range)
  assert.deepEqual(daily.map(r => [r.start, r.total]), [['2024-02-28', 1], ['2024-02-29', 0], ['2024-03-01', 1], ['2024-03-02', 0]])
  const weekly = groupReportPeriods(reports, { start: '2024-02-28', end: '2024-03-05' }, 'week')
  assert.deepEqual(weekly.map(r => [r.start, r.end, r.total]), [['2024-02-28', '2024-03-03', 2], ['2024-03-04', '2024-03-05', 0]])
})

test('weekly groups separate Sunday and Monday across years; monthly and annual handle missing periods', () => {
  const reports = [report('sunday', '2023-12-31T15:59:59Z'), report('monday', '2023-12-31T16:00:00Z'), report('march', '2024-03-02T00:00:00Z')]
  assert.deepEqual(groupReportPeriods(reports, { start: '2023-12-31', end: '2024-01-01' }, 'week').map(r => r.total), [1, 1])
  assert.deepEqual(groupReportPeriods(reports, { start: '2023-12-31', end: '2024-03-02' }, 'month').map(r => r.total), [1, 1, 0, 1])
  assert.deepEqual(groupReportPeriods(reports, { start: '2023-01-01', end: '2025-12-31' }, 'year').map(r => r.total), [1, 2, 0])
})

test('all groupings and both bases reconcile to the exact selected records and summary CSV', () => {
  const reports = reportsResponse.data
  for (const dateField of ['occurredAt', 'submittedAt']) for (const groupBy of ['day', 'week', 'month', 'year']) {
    const range = { start: '2026-01-01', end: '2026-12-31' }
    const selected = filterExportReports(reports, range, dateField)
    const expected = reportSummary(selected)
    const rows = groupReportPeriods(reports, range, groupBy, dateField)
    for (const key of ['total', 'pending', 'verified', 'closed']) assert.equal(rows.reduce((sum, r) => sum + r[key], 0), expected[key])
    const csvRows = createSummaryCsv(reports, { range, groupBy, dateField, source: 'Demo' }).trim().split('\r\n').slice(1)
    assert.equal(csvRows.length, rows.length)
    assert.equal(csvRows.reduce((sum, row) => sum + Number(row.split(',')[5].replaceAll('"', '')), 0), selected.length)
  }
})

test('bounded empty summaries retain zeros, all-time empty stays empty, invalid dates never become epoch records', () => {
  assert.deepEqual(groupReportPeriods([], {}), [])
  assert.equal(groupReportPeriods([], { start: '2026-10-01', end: '2026-10-03' }).length, 3)
  assert.ok(groupReportPeriods([], { start: '2026-10-01', end: '2026-10-03' }).every(r => r.total === 0))
  assert.deepEqual(groupReportPeriods([report('bad', null)], {}), [])
  assert.deepEqual(groupReportPeriods([report('bad', 'invalid')], {}), [])
  assert.equal(createSummaryCsv([], { range: {}, source: 'Demo' }).split('\r\n').length, 2)
})
