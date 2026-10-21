import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformSync } from 'esbuild'
import { luzonReportsResponse, LUZON_SAMPLE_BOUNDS } from '../src/data/luzonReports.js'
import { ACCIDENT_CATEGORIES, REPORT_STATUSES, parseReportsResponse, reportsToGeoJSON, reportSummary } from '../src/models/report.js'

const reports = luzonReportsResponse.data
test('30 complete fictional reports cover all six requested Luzon regions', () => {
  assert.equal(parseReportsResponse(luzonReportsResponse), luzonReportsResponse)
  assert.equal(reports.length, 30)
  assert.equal(new Set(reports.map(({ id }) => id)).size, 30)
  for (const region of ['Central Luzon', 'Metro Manila', 'CALABARZON', 'Ilocos', 'Cagayan Valley', 'Bicol Region']) {
    const regional = reports.filter((report) => report.region === region)
    assert.equal(regional.length, 5)
    assert.equal(new Set(regional.map(({ categoryId }) => categoryId)).size, 5)
    assert.ok(regional.some(({ verification }) => verification.verifiedAt))
  }
  assert.deepEqual(new Set(reports.map(({ status }) => status)), new Set(REPORT_STATUSES))
  assert.deepEqual(new Set(reports.map(({ severity }) => severity)), new Set([1, 2, 3]))
  for (const report of reports) {
    assert.ok(report.sample && report.id.startsWith('DEMO-LUZON-'))
    assert.ok(Date.parse(report.submittedAt) > Date.parse(report.occurredAt))
    const { latitude, longitude } = report.location.coordinates
    assert.ok(longitude > LUZON_SAMPLE_BOUNDS[0][0] && longitude < LUZON_SAMPLE_BOUNDS[1][0])
    assert.ok(latitude > LUZON_SAMPLE_BOUNDS[0][1] && latitude < LUZON_SAMPLE_BOUNDS[1][1])
  }
})

test('sample markers use real report adapters and map filters with matching statistics', () => {
  const geojson = reportsToGeoJSON(reports)
  assert.equal(geojson.features.length, 30)
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  const filterSource = source.slice(source.indexOf('function filterReports('), source.indexOf('export default function MapView'))
  const context = vm.createContext({})
  vm.runInContext(filterSource, context)
  const { filterReports } = context
  for (const category of ACCIDENT_CATEGORIES) {
    const result = filterReports(geojson, [category.id], true, '')
    assert.equal(result.features.length, 6)
    assert.ok(result.features.every(({ properties }) => properties.reportType === category.id))
  }
  const verified = filterReports(geojson, ACCIDENT_CATEGORIES.map(({ id }) => id), false, '')
  assert.equal(verified.features.length, reportSummary(reports).verified)
  for (const status of REPORT_STATUSES) {
    assert.equal(filterReports(geojson, ACCIDENT_CATEGORIES.map(({ id }) => id), true, status).features.length,
      reports.filter((report) => report.status === status).length)
  }
})

const filename = fileURLToPath(new URL('../src/components/MapReportCard.jsx', import.meta.url))
const module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(filename, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
  { module, exports: module.exports, require: createRequire(filename) }, { filename })
const Card = module.exports.default
test('floating report card renders the selected record and labels fictional samples', () => {
  const render = (report, props = {}) => renderToStaticMarkup(React.createElement(Card, { report, ...props }))
  for (const report of [reports[0], reports[27]]) {
    const html = render(report)
    for (const text of [report.id, report.location.address, report.status, report.description, 'Fictional sample', 'Zoom to report']) assert.ok(html.includes(text))
    assert.ok(!html.includes('Full details'))
    assert.ok(!html.includes('undefined'))
  }
  assert.equal(render(null), '')
  assert.ok(render({ ...reports[0], sample: false }, { onOpenReport: () => {} }).includes('Full details'))
})


test('every demo report has three distinct local photos and previews render photos with escaped descriptions', async () => {
  const { reportsResponse } = await import('../src/data/reports.js')
  const all = [...reports, ...reportsResponse.data]
  const urls = new Set()
  for (const report of all) {
    assert.equal(report.evidence.length, 3)
    assert.equal(new Set(report.evidence.map(file => file.url)).size, 3)
    for (const file of report.evidence) {
      urls.add(file.url)
      assert.ok(readFileSync(new URL('../public' + file.url, import.meta.url)).length > 0)
    }
  }
  assert.equal(urls.size, 5)
  const Preview = module.exports.MapReportPreview
  const html = renderToStaticMarkup(React.createElement(Preview, { report: { ...reports[0], description: '<script>unsafe</script>' } }))
  assert.ok(html.includes(reports[0].evidence[0].url))
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
  assert.ok(!html.includes('<script>'))
  const empty = renderToStaticMarkup(React.createElement(Preview, { report: { ...reports[0], evidence: [] } }))
  assert.ok(empty.includes('No incident photos available.'))
})
