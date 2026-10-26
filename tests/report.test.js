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
  assert.ok(a.includes(first.evidence[0].url))
  assert.ok(render({ ...first, evidence: [] }).includes('No evidence attached.'))
  const unknown = { ...first, injuries:{status:'unknown', injuredCount:null, fatalityCount:null}, evidence:[{id:'photo-1', fileName:'scene.jpg', mimeType:'image/jpeg', url:'/evidence/scene.jpg'}] }
  const html = render(unknown)
  assert.ok(html.includes('Unknown') && html.includes('/evidence/scene.jpg'))
})

test('admin reporter info shows submitted full name/contact, escapes text and handles absent details', () => {
  const users = reportsResponse.included.users
  const report = { ...first, reporter: { ...first.reporter, name: 'José Dela Cruz <Reporter>', contact: '+63 912 345 6789' } }
  const modal = (r) => renderToStaticMarkup(React.createElement(ReportModal, { report: r, users }))
  const table = (records) => renderToStaticMarkup(React.createElement(ReportsView, { reports: records, users }))
  for (const html of [modal(report), table([report])]) {
    assert.ok(html.includes('Reporter info'))
    assert.ok(html.includes('Full name') && html.includes('Contact number'))
    assert.ok(html.includes('José Dela Cruz &lt;Reporter&gt;'))
    assert.ok(html.includes('+63 912 345 6789'))
    assert.ok(!html.includes('Demo Reporter'), 'Account name must not replace the submitted reporter name')
  }
  const missing = { ...report, reporter: { userId: null, name: null, contact: null } }
  assert.ok(modal(missing).includes('Not provided'))
  assert.ok(table([missing]).includes('Name not provided'))
  assert.ok(table([missing]).includes('Contact not provided'))
  assert.ok(table([]).includes('colSpan="9"'))
})

// Execute the real layer builder: a bundler accepts undefined identifiers in
// function bodies, so schema/render tests alone cannot catch setup exceptions.
test('map layer setup executes and uses valid category colors and severity stops', () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  const helpers = source.slice(source.indexOf('const PALETTES ='), source.indexOf('export default function MapView'))
  const sources = new Map(), layers = []
  const map = { getSource: (id) => sources.get(id), addSource: (id, options) => sources.set(id, options), addLayer: (layer) => layers.push(layer) }
  const context = vm.createContext({ ACCIDENT_CATEGORIES, map })
  vm.runInContext(helpers + '\naddReportLayers(map);', context)
  assert.equal(sources.has('roadsafe-reports'), true)
  assert.deepEqual(layers.map((l) => l.id), ['roadsafe-heatmap', 'roadsafe-clusters', 'roadsafe-cluster-count', 'roadsafe-report-glow', 'roadsafe-affected-streets', 'roadsafe-report-points'])
  const weight = layers.find((l) => l.id === 'roadsafe-heatmap').paint['heatmap-weight']
  assert.deepEqual(JSON.parse(JSON.stringify(weight)), ['interpolate', ['linear'], ['get', '_severityWeight'], 1, .25, 3, 1])
  for (const id of ['roadsafe-report-glow']) {
    const colors = layers.find((l) => l.id === id).paint['circle-color']
    assert.deepEqual(JSON.parse(JSON.stringify(colors)), ['coalesce', ['get', 'caseColor'], '#94a3b8'])
  }
  const marker = layers.find((layer) => layer.id === 'roadsafe-report-points')
  assert.equal(marker.type, 'symbol')
  assert.ok(JSON.stringify(marker.layout['icon-image']).includes('reportType'))
  assert.ok(JSON.stringify(marker.layout['icon-image']).includes('caseColor'))
  vm.runInContext('addReportLayers(map);', context)
  assert.equal(layers.length, 6, 'setup does not duplicate existing report layers')
})


test('structured vehicle states validate and render without treating unknown as none', () => {
  const render = report => renderToStaticMarkup(React.createElement(ReportModal, { report, users: reportsResponse.included.users }));
  for (const [vehicleStatus, vehicles] of [['unknown', []], ['not_applicable', []], ['known', [{type:'car',count:2}]]]) {
    const report = {...first, vehicleStatus, vehicles};
    assert.deepEqual(validateReport(report), []);
    assert.ok(render(report).includes(vehicleStatus === 'known' ? '2 × car' : vehicleStatus === 'unknown' ? 'Unknown' : 'Not applicable'));
  }
  for (const report of [{...first,vehicleStatus:'known',vehicles:[]}, {...first,vehicleStatus:'unknown',vehicles:[{type:'car',count:2}]}, {...first,vehicleStatus:'invalid'}]) {
    assert.ok(validateReport(report).some(error => error.includes('Vehicle status')));
  }
  assert.ok(validateReport({...first,vehicles:[{type:'car',count:0}]}).length);
  assert.ok(validateReport({...first,vehicles:[{type:'car',count:1.5}]}).length);
});

test('management embeds the existing review form without a modal dialog', () => {
  const html = renderToStaticMarkup(React.createElement(ReportModal, { report: first, users: reportsResponse.included.users, embedded: true }))
  assert.ok(!html.includes('<dialog'))
  assert.ok(html.includes('Report Details:'))
  assert.ok(html.includes('Save session changes'))
  const table = renderToStaticMarkup(React.createElement(ReportsView, { reports: reportsResponse.data, users: reportsResponse.included.users, detailPanel: React.createElement('section', null, 'Selected workspace') }))
  assert.ok(table.includes('Awaiting review'))
  assert.ok(table.includes('Sort reports'))
  assert.ok(table.includes('Selected workspace'))
})

test('report table shows labeled coordinates when the place name is missing', () => {
  const table = location => renderToStaticMarkup(React.createElement(ReportsView, { reports: [{ ...first, location }], users: reportsResponse.included.users }))
  const coordinates = { latitude: 14.85234, longitude: 120.81234 }
  for (const address of [null, '', '   ']) {
    const html = table({ address, coordinates })
    assert.ok(html.includes('Lat: 14.85234'))
    assert.ok(html.includes('Lng: 120.81234'))
    assert.ok(!html.includes('Confirmed map location'))
  }
  assert.ok(table({ address: 'Malolos', coordinates }).includes('Malolos'))
  assert.ok(!table({ address: 'Malolos', coordinates }).includes('Lat:'))
  assert.ok(table({ address: null, coordinates: null }).includes('Location unavailable'))
  const zero = table({ address: null, coordinates: { latitude: 0, longitude: 0 } })
  assert.ok(zero.includes('Lat: 0.00000') && zero.includes('Lng: 0.00000'))
})

test('report details replace coordinates with a map button and handle missing locations', () => {
  const render = report => renderToStaticMarkup(React.createElement(ReportModal, { report, users: reportsResponse.included.users, embedded: true, onViewOnMap() {} }))
  const html = render(first)
  assert.match(html, /type="button"[^>]*>[\s\S]*?View on map<\/button>/)
  assert.ok(!html.includes(`${first.location.coordinates.latitude.toFixed(5)}, ${first.location.coordinates.longitude.toFixed(5)}`))
  const missing = render({ ...first, location: { ...first.location, coordinates: null } })
  assert.match(missing, /Map location unavailable/)
  assert.ok(!missing.includes('View on map'))
})
