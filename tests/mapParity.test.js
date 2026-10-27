import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { reportsResponse } from '../src/data/reports.js'
import { transformSync } from 'esbuild'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { hasActiveOfficer } from '../src/data/responders.js'

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('both map sources require assignment before starting a route', () => {
  const map = source('components/MapView.jsx')
  const callback = map.match(/onDispatch=\{(\(station, feature\) => \{[\s\S]*?)\}\} \/>/)[1]
  assert.doesNotMatch(callback, /requestAssistance/)
  assert.match(map, /assignmentRequired=\{true\}/)
  assert.match(map, /preview=\{false\}/)
  assert.doesNotMatch(map, /enforcerRosterClient &&/)
})

test('demo roster and assignment use only demo accounts, with busy and verification checks', async () => {
  const url = new URL('../src/models/demoEnforcers.js', import.meta.url)
  assert.ok(existsSync(url), 'Demo needs its own assignment data adapter')
  const { demoStationEnforcers, demoAssignmentPatch } = await import(url)
  const users = reportsResponse.included.users
  const reports = structuredClone(reportsResponse.data)
  assert.ok(reports.some(report => report.status === 'Verified' && !report.assignedOfficerId), 'Demo must include an assignable verified report')
  const rows = demoStationEnforcers(users, reports)
  const ready = rows.find(row => !row.busy)
  assert.ok(ready, 'The demo must have an available simulated officer')
  assert.ok(rows.every(row => users.some(user => user.id === row.id && user.responderType === 'police')))
  const report = { ...reports[0], status: 'Verified', assignedOfficerId: null }
  const data = [report, ...reports.slice(1)]
  const patch = demoAssignmentPatch(users, data, report.id, ready.id)
  assert.equal(patch.status, 'Assigned')
  assert.equal(patch.assignedOfficerId, ready.id)
  assert.equal(report.assignedOfficerId, null)
  assert.throws(() => demoAssignmentPatch(users, data, report.id, 'shared-officer'), /available/i)
  assert.throws(() => demoAssignmentPatch(users, [{ ...report, status: 'Submitted' }], report.id, ready.id), /verified/i)
  assert.throws(() => demoAssignmentPatch(users, [{ ...report, isDuplicate: true }], report.id, ready.id), /verified/i)
  assert.throws(() => demoAssignmentPatch(users, [{ ...report, assignedOfficerId: ready.id }], report.id, ready.id), /verified/i)
  assert.throws(() => demoAssignmentPatch(users, [...data, { id: 'busy', status: 'Assigned', assignedOfficerId: ready.id }], report.id, ready.id), /available/i)
})

test('demo assignment waits for its local save and never calls the shared backend', async () => {
  const panel = source('components/StationEnforcers.jsx')
  const body = panel.match(/async function assign\(\) \{([\s\S]*?)\n  \}/)[1]
  for (const denied of [false, true]) {
    const calls = []
    let resolve, reject
    const saved = new Promise((yes, no) => { resolve = yes; reject = no })
    const assign = vm.runInNewContext('(async () => {' + body + '})', {
      client: null, report: { id: 'demo-report' }, station: { id: 'station' }, selected: 'demo-officer',
      setBusy() {}, setError: message => { if (message) calls.push('error') }, setMessage() {}, setSelected() {}, setRows() {},
      assignStationEnforcer: () => { throw Error('Demo called shared assignment') },
      onAssign: (report, station, officer) => {
        assert.equal(report.id, 'demo-report'); assert.equal(station, 'station'); assert.equal(officer, 'demo-officer')
        calls.push('save'); return saved
      },
      onResponseStarted: () => calls.push('responding'), onAssigned: undefined,
    })
    const pending = assign()
    assert.deepEqual(calls, ['save'])
    if (denied) reject(Error('Officer busy'))
    else resolve()
    await pending
    assert.deepEqual(calls, denied ? ['save', 'error'] : ['save', 'responding'])
  }
})

test('refreshing the demo roster never waits for the shared backend', () => {
  const url = new URL('../src/components/StationEnforcers.jsx', import.meta.url)
  const module = { exports: {} }, require = createRequire(url), setters = [], effects = []
  let slot = 0
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports,
    require: name => name === 'react' ? { ...React,
      useState: initial => { const index = slot++; return [initial, value => setters.push([index, value])] },
      useEffect: effect => effects.push(effect),
    } : name.includes('services/policeStations') ? { loadPoliceStations: () => assert.fail('Demo loaded live directory') }
      : name.includes('backend/enforcers') ? { availableEnforcer: row => !row.busy } : require(name),
  })
  const tree = module.exports.default({ client: null, station: { id: 'demo-station' },
    report: { status: 'Verified' }, demoRows: [{ id: 'demo-officer', name: 'Demo Officer', online: true, onDuty: true, busy: false }] })
  for (const effect of effects) effect()
  tree.props.children[0].props.children[1].props.onClick()
  assert.deepEqual(setters.find(([index]) => index === 5), [5, false], 'Refresh must leave Demo assignment usable')
})

test('demo cancellation releases the requested case only after its own save succeeds', async () => {
  const body = source('components/MapView.jsx').match(/async function cancelRequest\([^)]*\) \{([\s\S]*?)\n  \}/)[1]
  for (const status of ['Assigned', 'In Progress']) for (const denied of [false, true]) {
    const report = { id: 'demo-case', status, assignedOfficerId: 'demo-officer', officialRemarks: 'Keep remarks' }
    const calls = []
    const cancel = vm.runInNewContext('(async () => {' + body + '})', {
      completed: false, selectedStation: { id: 'station' }, mapRecords: [report], enforcerClient: null, hasActiveOfficer,
      responders: { get: () => ({ request: { reportId: report.id } }), release: () => calls.push('release') },
      cancelStationEnforcer: () => assert.fail('Demo called shared cancellation'),
      onDemoSave: async (id, patch) => {
        calls.push('save'); assert.equal(id, report.id); assert.equal(patch.assignedOfficerId, null)
        assert.equal(patch.status, status === 'Assigned' ? 'Verified' : 'Under Review')
        assert.ok(patch.officialRemarks.includes('Keep remarks'))
        if (denied) throw Error('Local save failed')
      },
    })
    if (denied) await assert.rejects(cancel(), /Local save failed/)
    else await cancel()
    assert.deepEqual(calls, denied ? ['save'] : ['save', 'release'])
  }
})

test('both source cards expose the same controls and retain cancellation after route completion', () => {
  const url = new URL('../src/components/ResponderCard.jsx', import.meta.url)
  const module = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
    { module, exports: module.exports, require: createRequire(url) })
  const station = { id: 'station', name: 'Station', lat: 14, lng: 120, responderType: 'police' }
  const scene = { reportId: 'report', label: 'Collision', coordinates: [120, 14] }
  for (const status of ['Ready to request', 'Responding', 'Completed']) {
    const request = status === 'Ready to request' ? null : { ...scene, id: 'request', sceneLabel: scene.label, sceneCoordinates: scene.coordinates, personnel: 1, requestedAt: '2026-10-27T00:00:00Z' }
    const render = sourceLabel => renderToStaticMarkup(React.createElement(module.exports.default, {
      station, scene, data: { status, request }, assignmentRequired: true, sourceLabel,
      enforcerPanel: React.createElement('p', null, 'Assignment'),
    }))
    const shared = render('Shared reports'), demo = render('Demo reports')
    assert.equal(shared.replace('Shared reports', 'Source'), demo.replace('Demo reports', 'Source'))
    assert.ok(!shared.includes('Request police personnel'))
    if (status === 'Completed') {
      assert.ok(shared.includes('Cancel request'))
      assert.ok(!shared.includes('Station available'))
    }
  }
})

test('medical drop selects without saving and recommendations are isolated by source', () => {
  const map = source('components/MapView.jsx')
  const drop = map.match(/onRecommend=\{([^\n]+)\}/)[1]
  assert.doesNotMatch(drop, /recommendMedical/)
  assert.match(drop, /setSelectedStation/)
  assert.match(map, /recommendationKey/)
  assert.match(map, /sourceLabel=/)
})

test('operational map uses only backend assignment and report writes', () => {
  const map = source('components/MapView.jsx')
  assert.doesNotMatch(map, /!enforcerClient \|\| hasActiveOfficer/)
  const app = source('App.jsx')
  assert.doesNotMatch(app, /onDemoSave=\{|onDemoAssign=\{/)
  assert.match(app, /enforcerClient=\{live \? backend : null\}/)
  assert.doesNotMatch(app, /enforcerRosterClient=\{live \? backend : null\}/)
})
