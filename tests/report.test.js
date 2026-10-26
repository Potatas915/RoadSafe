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

test('report references display the full UUID in details and officer dispatch', () => {
  const id = 'c12e363d-c13c-43b3-870c-399b7ecadf1a'
  const report = { ...first, id, status: 'Assigned', assignedOfficerId: 'officer' }
  const users = [{ id: 'officer', name: 'Officer', role: ROLES.OFFICER, responderType: 'police', unit: 'Unassigned', enabled: true }]
  for (const View of [component('../src/components/OfficersView.jsx'), ReportModal]) {
    const html = renderToStaticMarkup(React.createElement(View, { report, reports: [report], users }))
    assert.ok(html.includes(`>${id}<`) || html.includes(`>#${id}<`), 'full visible reference, not just a tooltip or aria-label')
  }
})

test('report table keeps compact IDs on one line while preserving full copy and tooltip IDs', () => {
  const id = 'c12e363d-c13c-43b3-870c-399b7ecadf1a'
  for (const detailPanel of [null, React.createElement('aside', null, 'Details')]) {
    const html = renderToStaticMarkup(React.createElement(ReportsView, { reports: [{ ...first, id }], users: reportsResponse.included.users, detailPanel }))
    assert.ok(html.includes('>#c12e363d</span>'))
    assert.ok(!html.includes(`>#${id}</span>`))
    assert.ok(html.includes(`title="${id}"`))
    assert.ok(html.includes(`aria-label="Copy report ID ${id}"`))
    assert.match(html, /class="[^"]*whitespace-nowrap[^"]*" title="c12e363d/)
  }
})

test('map card uses a compact reference while preserving the full ID for copying and details', async () => {
  const id = 'c12e363d-c13c-43b3-870c-399b7ecadf1a'
  const Card = component('../src/components/MapReportCard.jsx')
  const html = renderToStaticMarkup(React.createElement(Card, { report: { ...first, id }, onOpenReport() {} }))
  assert.ok(html.includes('>#c12e363d</span>'))
  assert.ok(!html.includes(`>${id}<`))
  assert.ok(html.includes(`title="${id}"`))
  assert.match(html, /aria-label="Copy full report ID"/)
  assert.match(html, /Full details/)
  const source = readFileSync(new URL('../src/components/MapReportCard.jsx', import.meta.url), 'utf8')
  const body = source.match(/async function copyReportId\(\) \{([\s\S]*?)\n  \}/)[1]
  for (const denied of [false, true]) {
    let copied, message
    const copy = vm.runInNewContext('(async () => {' + body + '})', {
      report: { id }, setCopyMessage: value => { message = value },
      navigator: { clipboard: { writeText: async value => { if (denied) throw Error('Denied'); copied = value } } },
    })
    await copy()
    if (denied) assert.ok(message.includes(id))
    else { assert.equal(copied, id); assert.match(message, /copied/i) }
  }
})

test('report details show reporter clarification below the original description', () => {
  const events = [
    { id: 'request', type: 'review_updated', createdAt: '2026-10-27T01:00:00Z', message: 'Please clarify the vehicle colour.' },
    { id: 'reply', type: 'clarification_response', createdAt: '2026-10-27T02:00:00Z', message: 'The blue car was on the right.\n<More details>' },
  ]
  const render = events => renderToStaticMarkup(React.createElement(ReportModal, { report: { ...first, events }, users: reportsResponse.included.users }))
  const html = render(events)
  const description = html.indexOf('>Description</h3>')
  const additional = html.indexOf('>Additional information</h3>')
  const history = html.indexOf('>Report history and clarification</h3>')
  assert.ok(description >= 0 && additional > description && history > additional)
  const section = html.slice(additional, html.indexOf('</section>', additional))
  assert.match(section, /The blue car was on the right/)
  assert.match(section, /&lt;More details&gt;/)
  assert.ok(!section.includes('Please clarify'))
  assert.ok(html.includes(first.description))
  assert.ok(!render([events[0]]).includes('>Additional information</h3>'))
  assert.ok(!render([]).includes('>Additional information</h3>'))
})

test('report table shows status without a redundant verification subtitle', () => {
  const html = renderToStaticMarkup(React.createElement(ReportsView, { reports: reportsResponse.data, users: reportsResponse.included.users }))
  assert.match(html, />Status<\/th>/)
  for (const status of ['Verified', 'Rejected']) assert.ok(html.includes(`</i>${status}</span>`))
  for (const text of ['Officially verified', 'Unverified', 'Status / verification']) assert.ok(!html.includes(text), text)
  const duplicate = renderToStaticMarkup(React.createElement(ReportsView, { reports: [{ ...first, isDuplicate: true }], users: reportsResponse.included.users }))
  assert.match(duplicate, /Duplicate report/)
})

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

test('details render the chosen record, real evidence, unknown injuries, and its current status', () => {
  const users = reportsResponse.included.users
  const render = (report) => renderToStaticMarkup(React.createElement(ReportModal, {report, users, onSave(){}, onClose(){}}))
  const a = render(first), b = render(second)
  assert.ok(a.includes(first.id) && a.includes(first.location.address))
  assert.ok(b.includes(second.id) && b.includes(second.location.address) && !b.includes(first.location.address))
  assert.ok(a.includes('Public submission') && b.includes('Officially verified accident record'))
  assert.ok(a.includes(first.status) && b.includes(second.status))
  assert.ok(!a.includes('aria-label="Report status"'))
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
  assert.ok(html.includes('Save session remarks'))
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

test('report assignment is read-only and directs verified cases to the map', () => {
  const users = reportsResponse.included.users
  const render = report => renderToStaticMarkup(React.createElement(ReportModal, { report, users, embedded: true, live: true, onViewOnMap() {} }))
  const pending = render({ ...first, assignedOfficerId: null })
  assert.ok(!pending.includes('aria-label="Assign officer"'))
  assert.match(pending, /No enforcer assigned/)
  assert.match(pending, /Verify this report/)
  assert.ok(!pending.includes('>Assign on map<'))
  const verified = render({ ...first, status: 'Verified', assignedOfficerId: null })
  assert.match(verified, />Assign on map</)
  const assigned = render({ ...first, status: 'Assigned', assignedOfficerId: 'officer-mark' })
  assert.match(assigned, /Officer Mark Santos/)
  assert.match(assigned, /BL-TM-04/)
  assert.match(assigned, /View assignment on map/)
  assert.ok(!assigned.includes('aria-label="Assign officer"'))
})

test('admin workflow offers review decisions rather than a status dropdown', () => {
  const render = (status, extra = {}) => renderToStaticMarkup(React.createElement(ReportModal, { report: { ...first, status, assignedOfficerId: null, ...extra }, users: reportsResponse.included.users, embedded: true }))
  const submitted = render('Submitted')
  assert.ok(!submitted.includes('aria-label="Report status"'))
  assert.match(submitted, />Start review</)
  const review = render('Under Review')
  for (const label of ['Request information', 'Verify report', 'Reject report']) assert.ok(review.includes('>' + label + '<'), label)
  for (const status of ['Assigned', 'In Progress', 'Resolved / Closed']) assert.ok(!review.includes('value="' + status + '"'))
  assert.match(render('Additional Information Required'), />Resume review</)
  for (const status of ['Verified', 'Assigned', 'In Progress']) assert.match(render(status), />Return to review</)
  for (const status of ['Resolved / Closed', 'Rejected']) assert.ok(!render(status).includes('>Return to review<'))
})

test('dispatch lists registered active officers without substituting demo officers or claiming duty availability', () => {
  const OfficersView = component('../src/components/OfficersView.jsx')
  const registered = { id: 'registered-enforcer', name: 'Registered Traffic Enforcer', unit: 'Existing unit', role: ROLES.OFFICER, responderType: 'police', enabled: true }
  const html = renderToStaticMarkup(React.createElement(OfficersView, { reports: reportsResponse.data, users: [registered, { ...registered, id: 'medical', name: 'Legacy medical responder', responderType: 'medical' }, { ...registered, id: 'suspended', name: 'Suspended enforcer', enabled: false }] }))
  assert.match(html, /Registered Traffic Enforcer/)
  for (const name of ['Officer Mark Santos', 'Officer Juan Dela Cruz', 'Medic Ana Reyes', 'Medic Paolo Cruz', 'Ambulance Unit A-1', 'Suspended enforcer', 'Legacy medical responder', 'All units', 'Unit type', 'Medical']) assert.ok(!html.includes(name), name)
  assert.match(html, /No listed cases/)
  assert.match(html, /online and on-duty availability/)
})

test('dispatch subtitles follow assigned cases instead of the legacy Unassigned unit placeholder', () => {
  const OfficersView = component('../src/components/OfficersView.jsx')
  const officer = { id: 'assigned-officer', name: 'Assigned Enforcer', unit: 'Unassigned', role: ROLES.OFFICER, responderType: 'police', enabled: true }
  const render = (reports, user = officer) => renderToStaticMarkup(React.createElement(OfficersView, { reports, users: [user] }))
  const assigned = { ...first, status: 'Assigned', assignedOfficerId: officer.id }
  const html = render([assigned])
  assert.ok(!html.includes('Unassigned'))
  assert.equal((html.match(/1 active case</g) ?? []).length, 2, 'roster and selected officer use the same case count')
  const cleared = render([{ ...assigned, assignedOfficerId: null }])
  assert.equal((cleared.match(/No active cases</g) ?? []).length, 2)
  assert.ok(!render([{ ...assigned, status: 'Resolved / Closed' }]).includes('1 active case'))
  assert.match(render([assigned], { ...officer, unit: 'Traffic Unit A' }), /Unit: Traffic Unit A/)
})
