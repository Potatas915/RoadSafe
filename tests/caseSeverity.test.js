import test from 'node:test'
import assert from 'node:assert/strict'
import { caseSeverity, reportedVehicles } from '../src/models/caseSeverity.js'
const report = (status, injuredCount, vehicles = 1, categoryId = 'collision', fatalityCount = 0) => ({ categoryId, injuries: { status, injuredCount, fatalityCount }, vehicles: vehicles ? [{ type: 'Car', count: vehicles }] : [] })
test('severity reflects incident facts and increases with injured people and vehicles', () => {
  assert.equal(caseSeverity(report('none', 0)).score, 15)
  assert.equal(caseSeverity(report('none', 0)).label, 'Low')
  assert.equal(caseSeverity(report('injured', 1, 2)).score, 50)
  assert.equal(caseSeverity(report('injured', 1, 2)).label, 'Medium')
  assert.equal(caseSeverity(report('injured', 3, 2, 'rollover')).label, 'High')
  assert.equal(caseSeverity(report('injured', 5, 4, 'rollover')).score, 90)
  assert.equal(caseSeverity(report('injured', 5, 4, 'rollover')).label, 'Critical')
  assert.equal(caseSeverity(report('injured', 100, 100, 'rollover')).score, 90, 'count contributions are capped')
})
test('fatalities override unknown counts; missing injuries are never low severity', () => {
  assert.equal(caseSeverity(report('fatal', null, 0, 'other', null)).score, 100)
  assert.equal(caseSeverity(report('unknown', null)).score, null)
  assert.equal(caseSeverity(report('injured', null)).label, 'Unknown')
  assert.equal(reportedVehicles(report('none', 0, 0)), null)
  const r = report('injured', 1, 0)
  assert.match(caseSeverity(r).explanation, /Vehicles not reported/)
  assert.deepEqual(caseSeverity({ ...r, status: 'Resolved / Closed', severity: 3 }), caseSeverity(r))
  assert.equal(reportedVehicles({ vehicles: [{ type: 'Car', count: 2 }, { type: 'Motorcycle', count: 3 }] }), 5)
})
