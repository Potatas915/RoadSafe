import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canCorrectReport, correctionDraft, correctionValues } from '../src/models/reportCorrections.js'
import { saveReportCorrection } from '../src/backend/reports.js'
import { ACCIDENT_CATEGORIES } from '../src/models/report.js'
import { reportsResponse } from '../src/data/reports.js'

const report = () => ({ ...structuredClone(reportsResponse.data[0]), status: 'Under Review', verification: { verifiedAt: null, verifiedBy: null }, assignedOfficerId: null, isDuplicate: false,
  occurredAt: '2026-10-19T00:01:02.123456+00:00', vehicleStatus: 'unknown', vehicles: [], injuries: { status: 'unknown', injuredCount: null, fatalityCount: null } })
const now = Date.parse('2026-10-19T10:00:00Z')
test('corrections require an unverified, unassigned review-stage report', () => {
  for (const status of ['Submitted','Under Review','Additional Information Required']) assert.equal(canCorrectReport({ ...report(), status }), true)
  for (const status of ['Verified','Assigned','In Progress','Resolved / Closed','Rejected']) assert.equal(canCorrectReport({ ...report(), status }), false)
  assert.equal(canCorrectReport({ ...report(), isDuplicate: true }), false)
  assert.equal(canCorrectReport({ ...report(), assignedOfficerId: 'officer' }), false)
  assert.equal(canCorrectReport({ ...report(), verification: { verifiedAt: '2026-10-19' } }), false)
})
test('Manila correction drafts preserve unchanged submillisecond timestamps and unknown counts', () => {
  const draft = correctionDraft(report())
  assert.equal(draft.occurredAt, '2026-10-19T08:01:02.123')
  assert.equal(correctionValues(draft, now).occurredAt, report().occurredAt)
  assert.equal(correctionValues({ ...draft, occurredAt: '2026-10-19T09:30' }, now).occurredAt, '2026-10-19T01:30:00.000Z')
  assert.deepEqual(correctionValues(draft, now).injuries, report().injuries)
  assert.throws(() => correctionValues({ ...draft, latitude: '' }, now), /both coordinates/)
  assert.throws(() => correctionValues({ ...draft, latitude: '91' }, now), /range/)
  assert.throws(() => correctionValues({ ...draft, occurredAt: '2027-01-01T00:00' }, now), /future/)
})
test('vehicle and casualty corrections validate whole counts and normalize injury states', () => {
  const draft = { ...correctionDraft(report()), vehicleStatus: 'known', counts: { car: '2' }, injuryStatus: 'fatal', injuredCount: '', fatalityCount: '1' }
  assert.deepEqual(correctionValues(draft, now).vehicles, [{ type: 'car', count: 2 }])
  assert.deepEqual(correctionValues(draft, now).injuries, { status: 'fatal', injuredCount: null, fatalityCount: 1 })
  for (const bad of ['0','1.5','-1','1000']) assert.throws(() => correctionValues({ ...draft, counts: { car: bad } }, now), /whole numbers/)
  assert.throws(() => correctionValues({ ...draft, counts: {} }, now), /at least one/)
  assert.deepEqual(correctionValues({ ...draft, injuryStatus: 'none' }, now).injuries, { status: 'none', injuredCount: 0, fatalityCount: 0 })
})
test('correction adapter sends the expected version and restricted payload, propagating failures', async () => {
  const item = { ...report(), version: 3 }, values = correctionValues(correctionDraft(report()), now)
  await saveReportCorrection({ rpc: async (name, args) => {
    assert.equal(name, 'correct_accident_report')
    assert.deepEqual(args, { p_id: item.id, p_values: values, p_reason: 'Confirmed location', p_version: 3 })
    return {}
  } }, item, values, ' Confirmed location ')
  await assert.rejects(saveReportCorrection({ rpc: async () => ({ error: new Error('stale version') }) }, item, values, 'Reason'), /stale/)
})
const url = new URL('../src/components/ReportModal.jsx', import.meta.url), module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
  { module, exports: module.exports, require: createRequire(fileURLToPath(url)) })
test('correction controls retain historical category but exclude other disabled choices', () => {
  const item = report(), categories = ACCIDENT_CATEGORIES.map(c => ({ ...c, enabled: c.id === item.categoryId }))
  const html = renderToStaticMarkup(React.createElement(module.exports.CorrectionFields, { draft: correctionDraft(item), onChange: () => {}, categories, currentCategory: item.categoryId }))
  assert.match(html, /Asia\/Manila/)
  assert.ok(!html.includes('value="hit-and-run"') || item.categoryId === 'hit-and-run')
  assert.match(html, /Correction latitude/)
})
test('actual history renders retained before/after facts with escaped text and correction reason', () => {
  const before = correctionValues(correctionDraft(report()), now), after = { ...before, location: { ...before.location, address: '<confirmed>' } }
  const html = renderToStaticMarkup(React.createElement(module.exports.ReportHistory, { events: [{ id: 1, type: 'facts_corrected', createdAt: report().occurredAt, message: 'Investigation reason', correction: { before, after } }] }))
  for (const value of ['Incident facts corrected','Before correction','After correction','&lt;confirmed&gt;','Investigation reason']) assert.ok(html.includes(value), value)
})
