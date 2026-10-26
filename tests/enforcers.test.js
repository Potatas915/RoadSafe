import test from 'node:test'
import assert from 'node:assert/strict'
import { loadStationEnforcers, syncPoliceDirectory, availableEnforcer, assignStationEnforcer } from '../src/backend/enforcers.js'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'

test('station directory preserves OSM node/way/relation identity and strips UI metadata', async () => {
  await syncPoliceDirectory({ rpc: async (name, args) => {
    assert.equal(name, 'sync_police_stations')
    assert.deepEqual(args.p_stations, [{ id: 'way/23', name: 'Station', address: 'Road', lat: 14, lng: 120 }])
    return { data: 1 }
  } }, [{ id: 'way/23', name: 'Station', address: 'Road', lat: 14, lng: 120, request: 'local only' }])
})
test('only online on-duty enforcers without active cases are available', () => {
  for (const online of [false,true]) for (const onDuty of [false,true]) for (const busy of [false,true]) {
    assert.equal(availableEnforcer({ online, onDuty, busy }), online && onDuty && !busy)
  }
})
test('rosters reject malformed access flags and propagate access/installation failures', async () => {
  const row = { id: 'staff', name: '<Officer>', online: true, onDuty: true, busy: false }
  assert.deepEqual(await loadStationEnforcers({ rpc: async () => ({ data: [row] }) }, 'node/1'), [row])
  for (const data of [null, {}, [{ ...row, online: 'true' }]]) await assert.rejects(loadStationEnforcers({ rpc: async () => ({ data }) }, 'node/1'), /Invalid enforcer roster/)
  await assert.rejects(loadStationEnforcers({ rpc: async () => ({ error: new Error('Denied') }) }, 'node/1'), /Denied/)
})
test('station assignment carries server version/station and refuses demo-ineligible reports', async () => {
  const report = { id: 'report', status: 'Verified', version: 4, assignedOfficerId: null }
  let calls = 0
  const client = { rpc: async (name, args) => {
    calls++
    assert.equal(name, 'assign_station_enforcer')
    assert.deepEqual(args, { p_id: 'report', p_officer: 'staff', p_station: 'node/1', p_version: 4 })
    return {}
  } }
  await assignStationEnforcer(client, report, 'node/1', 'staff')
  for (const bad of [null, { ...report, status: 'Submitted' }, { ...report, assignedOfficerId: 'other' }, { ...report, isDuplicate: true }]) await assert.rejects(assignStationEnforcer(client, bad, 'node/1', 'staff'))
  assert.equal(calls, 1)
  await assert.rejects(assignStationEnforcer({ rpc: async () => ({ error: new Error('Enforcer went offline') }) }, report, 'node/1', 'staff'), /offline/)
})

test('actual station panel escapes names, excludes offline/busy officers and blocks sample assignment', () => {
  const url = new URL('../src/components/StationEnforcers.jsx', import.meta.url)
  const require = createRequire(url)
  const rows = [
    { id: 'ready', name: '<Ready>', unit: 'Unit', online: true, onDuty: true, busy: false },
    { id: 'offline', name: 'Offline Officer', online: false, onDuty: true, busy: false },
    { id: 'busy', name: 'Busy Officer', online: true, onDuty: true, busy: true },
  ]
  function render(report) {
    const state = [rows, 'ready', '', '', false, false, 0]
    const module = { exports: {} }
    vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
      module, exports: module.exports,
      require: name => name === 'react' ? { ...React, useState: () => [state.shift(), () => {}] }
        : name.includes('services/policeStations') ? { loadPoliceStations: () => [] }
        : name.includes('backend/enforcers') ? { availableEnforcer } : require(name),
    })
    return renderToStaticMarkup(React.createElement(module.exports.default, { client: {}, station: { id: 'node/1' }, report }))
  }
  const live = render({ status: 'Verified', assignedOfficerId: null })
  assert.match(live, /&lt;Ready&gt;/)
  assert.match(live, /value="ready"/)
  assert.doesNotMatch(live, /value="offline"|value="busy"/)
  assert.doesNotMatch(live, /disabled=""[^>]*>Assign to selected accident/)
  const sample = render(null)
  assert.match(sample, /disabled=""[^>]*>Assign to selected accident/)
  assert.match(sample, /Shared reports/)
  const assigned = render({ status: 'In Progress', assignedOfficerId: 'ready' })
  assert.match(assigned, /Assigned enforcer: &lt;Ready&gt;/)
  assert.match(assigned, /Case status: In Progress/)
  assert.ok(!assigned.includes('aria-label="Assign station enforcer"'))
  assert.ok(!assigned.includes('Assign to selected accident'))
})

test('map keeps the signed-in station roster separate from demo write access', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const map = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  assert.ok(app.includes('enforcerRosterClient={live ? backend : null}'), 'roster stays available while previewing')
  assert.ok(map.includes('client={enforcerRosterClient}'), 'station panel loads the roster')
  assert.ok(map.includes('report={enforcerClient ? selectedRecord : null}'), 'demo records cannot be assigned')
})
