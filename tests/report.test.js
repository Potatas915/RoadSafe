import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { reportsResponse } from '../src/data/reports.js'
import { REPORT_STATUSES, REPORT_STATUS, ROLES, ACCIDENT_CATEGORIES, validateReport, parseReportsResponse, reportsToGeoJSON, updateReport, reportSummary } from '../src/models/report.js'
const clone = () => structuredClone(reportsResponse)
const first = reportsResponse.data[0]
const second = reportsResponse.data[1]

function component(relative) {
  const url = new URL(relative, import.meta.url)
  const filename = fileURLToPath(url)
  const code = transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: createRequire(filename) }, { filename })
  return module.exports.default
}
const ReportModal = component('../src/components/ReportModal.jsx')
const ReportsView = component('../src/components/ReportsView.jsx')

test('one API fixture covers all statuses, categories and roles with valid references', () => {
  const response = parseReportsResponse(clone())
  assert.equal(response.data.length, 49)
  assert.equal(REPORT_STATUSES.length, 8)
  assert.deepEqual(new Set(response.data.map((r) => r.status)), new Set(REPORT_STATUSES))
  assert.deepEqual(new Set(response.data.map((r) => r.categoryId)), new Set(ACCIDENT_CATEGORIES.map((c) => c.id)))
  assert.deepEqual(new Set(response.included.users.map((u) => u.role)), new Set(Object.values(ROLES)))
  assert.ok(response.data.every((r) => validateReport(r).length === 0 && r.id.startsWith('RA-2026-')))
})

test('map adapter preserves category and stable IDs without leaking reporter data', () => {
  const point = reportsToGeoJSON([second]).features[0]
  assert.equal(point.id, second.id)
  assert.equal(point.properties._reportId, second.id)
  assert.equal(point.properties.reportType, second.categoryId)
  assert.deepEqual(point.geometry.coordinates, [second.location.coordinates.longitude, second.location.coordinates.latitude])
  assert.equal('reporter' in point.properties, false)
  assert.equal('contact' in point.properties, false)
})

test('optional coordinates stay absent and blank/out-of-range values never become map points', () => {
  for (const coordinates of [null, { longitude: '', latitude: '' }, { longitude: 181, latitude: 90 }]) {
    const report = { ...first, location: { ...first.location, coordinates } }
    assert.equal(reportsToGeoJSON([report]).features.length, 0)
    assert.equal(validateReport(report).length === 0, coordinates === null)
  }
  assert.equal(reportsToGeoJSON([{ ...first, location: { ...first.location, coordinates: { longitude: 0, latitude: 0 } } }]).features.length, 1)
})

test('schema rejects missing fields, legacy status/category, duplicate IDs and invalid relations', () => {
  for (const field of ['occurredAt', 'submittedAt', 'description', 'vehicles', 'injuries', 'reporter', 'evidence', 'verification']) {
    const response = clone(); delete response.data[0][field]
    assert.throws(() => parseReportsResponse(response))
  }
  for (const patch of [{ status: 'Pending Review' }, { categoryId: 'intersection' }, { assignedOfficerId: 'missing-officer' }, { assignedOfficerId: 'public-demo' }]) {
    const response = clone(); Object.assign(response.data[0], patch)
    assert.throws(() => parseReportsResponse(response))
  }
  const duplicate = clone(); duplicate.data.push(duplicate.data[0]); assert.throws(() => parseReportsResponse(duplicate))
  const user = clone(); user.included.users[0].role = 'SuperAdmin'; assert.throws(() => parseReportsResponse(user))
  const link = clone(); link.data[0].evidence = [{id:'bad', fileName:'bad.jpg', mimeType:'image/jpeg', url:'javascript:alert(1)'}]; assert.throws(() => parseReportsResponse(link))
})

test('updates preserve identity and propagate into map/table/summary with verification provenance', () => {
  const patch = { status: REPORT_STATUS.ASSIGNED, assignedOfficerId: 'officer-mark', officialRemarks: 'Reviewed at desk.', rejectionReason: null }
  const updated = updateReport(first, patch, 'admin-demo', '2026-10-17T01:00:00Z')
  const response = clone(); response.data[0] = updated; parseReportsResponse(response)
  assert.equal(updated.id, first.id)
  assert.equal(first.status, REPORT_STATUS.UNDER_REVIEW)
  assert.equal(reportsToGeoJSON([updated]).features[0].properties.verified, true)
  assert.deepEqual(updated.verification, { verifiedAt:'2026-10-17T01:00:00Z', verifiedBy:'admin-demo' })
  assert.equal(reportSummary([updated]).pending, 0)
  const table = renderToStaticMarkup(React.createElement(ReportsView, { reports:[updated], users:response.included.users, onOpenReport(){} }))
  assert.ok(table.includes(updated.id) && table.includes('Officer Mark Santos') && table.includes(REPORT_STATUS.ASSIGNED))
  assert.throws(() => updateReport(first, { ...patch, assignedOfficerId:null }, 'admin-demo'))
  assert.throws(() => updateReport(first, { ...patch, status:REPORT_STATUS.REJECTED }, 'admin-demo'))
  const rejected = updateReport(updated, { ...patch, status:REPORT_STATUS.REJECTED, rejectionReason:'Duplicate submission.' }, 'admin-demo')
  assert.equal(rejected.rejectionReason, 'Duplicate submission.')
  assert.equal(rejected.verification.verifiedAt, null)
})

test('details render the chosen record, real evidence, unknown injuries, and all eight statuses', () => {
  const users = reportsResponse.included.users
  const render = (report) => renderToStaticMarkup(React.createElement(ReportModal, {report, users, onSave(){}, onClose(){}}))
  const a = render(first), b = render(second)
  assert.ok(a.includes(first.id) && a.includes(first.location.address))
  assert.ok(b.includes(second.id) && b.includes(second.location.address) && !b.includes(first.location.address))
  assert.ok(a.includes('Public submission') && b.includes('Officially verified accident record'))
  for (const status of REPORT_STATUSES) assert.ok(a.includes(status))
  assert.ok(a.includes('No evidence attached.') && !a.includes('Evidence_01.jpg'))
  const unknown = { ...first, injuries:{status:'unknown', injuredCount:null, fatalityCount:null}, evidence:[{id:'photo-1', fileName:'scene.jpg', mimeType:'image/jpeg', url:'/evidence/scene.jpg'}] }
  const html = render(unknown)
  assert.ok(html.includes('Unknown') && html.includes('/evidence/scene.jpg'))
})

// Execute the real layer builder: a bundler accepts undefined identifiers in
// function bodies, so schema/render tests alone cannot catch setup exceptions.
test('map layer setup executes and uses valid category colors and severity stops', () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  const helpers = source.slice(source.indexOf('const COLORS ='), source.indexOf('export default function MapView'))
  const sources = new Map(), layers = []
  const map = { getSource: (id) => sources.get(id), addSource: (id, options) => sources.set(id, options), addLayer: (layer) => layers.push(layer) }
  const context = vm.createContext({ ACCIDENT_CATEGORIES, map })
  vm.runInContext(helpers + '\naddReportLayers(map);', context)
  assert.equal(sources.has('roadsafe-reports'), true)
  assert.deepEqual(layers.map((l) => l.id), ['roadsafe-heatmap', 'roadsafe-clusters', 'roadsafe-cluster-count', 'roadsafe-report-glow', 'roadsafe-report-points'])
  const weight = layers.find((l) => l.id === 'roadsafe-heatmap').paint['heatmap-weight']
  assert.deepEqual(JSON.parse(JSON.stringify(weight)), ['interpolate', ['linear'], ['get', '_severityWeight'], 1, .25, 3, 1])
  for (const id of ['roadsafe-report-glow', 'roadsafe-report-points']) {
    const colors = layers.find((l) => l.id === id).paint['circle-color']
    for (const category of ACCIDENT_CATEGORIES) assert.ok(colors.includes(category.color))
  }
  vm.runInContext('addReportLayers(map);', context)
  assert.equal(layers.length, 5, 'setup does not duplicate existing report layers')
})
