import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canRequestPersonnel, hasPendingArrival, createPersonnelRequest, advancePersonnelRequest, DEFAULT_RESPONDER, RESPONDER_STATUSES, hasActiveOfficer } from '../src/data/responders.js'

const scene = { reportId: 'RA-2026-001', label: 'Collision', coordinates: [120.88, 14.85] }

test('shared progress and routes ignore saved requests until their accident has an active assigned officer', () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  const request = { reportId: 'report' }
  const expression = source.match(/const stationRequest = ([^;]+);/)[1]
  for (const report of [null, { id: 'report', status: 'Submitted' }, { id: 'report', status: 'Verified' }, { id: 'report', status: 'Assigned' }, { id: 'report', status: 'Resolved / Closed', assignedOfficerId: 'officer' }, { id: 'report', status: 'Assigned', assignedOfficerId: 'officer', isDuplicate: true }]) {
    assert.equal(vm.runInNewContext(expression, { savedStationRequest: request, enforcerClient: {}, mapRecords: report ? [report] : [], hasActiveOfficer }), null)
  }
  for (const status of ['Assigned', 'In Progress']) {
    assert.equal(vm.runInNewContext(expression, { savedStationRequest: request, enforcerClient: {}, mapRecords: [{ id: 'report', status, assignedOfficerId: 'officer' }], hasActiveOfficer }), request)
  }
  assert.equal(vm.runInNewContext(expression, { savedStationRequest: request, enforcerClient: null, mapRecords: [], hasActiveOfficer }), null)
  assert.equal(vm.runInNewContext(expression, { savedStationRequest: request, enforcerClient: null, mapRecords: [{ id: 'report', status: 'Assigned', assignedOfficerId: 'demo-officer' }], hasActiveOfficer }), request)
})
test('personnel requests validate inputs and snapshot the selected scene', () => {
  const original = structuredClone(scene)
  const request = createPersonnelRequest(original, { personnel: 3, urgency: 'Emergency', note: '  Bring equipment  ' })
  assert.match(request.id, /^REQ-/)
  assert.equal(request.personnel, 3)
  assert.equal('urgency' in request, false)
  assert.equal(request.note, 'Bring equipment')
  assert.ok(Number.isFinite(Date.parse(request.requestedAt)))
  original.coordinates[0] = 121
  assert.deepEqual(request.sceneCoordinates, scene.coordinates)
  for (const personnel of [0, 6, 1.5, '2']) assert.equal(createPersonnelRequest(scene, { personnel, urgency: 'Routine' }), null)
  assert.equal(createPersonnelRequest(null, { personnel: 1, urgency: 'Routine' }), null)
  assert.ok(createPersonnelRequest(scene, { personnel: 1 }))
})

test('local progress advances in sequence, retaining request details', () => {
  const request = createPersonnelRequest(scene, { personnel: 1, urgency: 'Routine' })
  let current = { status: 'Request Sent', request }
  assert.equal(advancePersonnelRequest(current, 'Completed'), current)
  for (const status of RESPONDER_STATUSES.slice(1)) {
    current = advancePersonnelRequest(current, status)
    assert.equal(current.status, status)
    assert.equal(current.request, request)
  }
  assert.equal(advancePersonnelRequest(current, 'Responding'), current)
  assert.equal(advancePersonnelRequest(DEFAULT_RESPONDER, 'Request Sent'), DEFAULT_RESPONDER)
})

const filename = fileURLToPath(new URL('../src/components/ResponderCard.jsx', import.meta.url))
const module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(filename, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
  { module, exports: module.exports, require: createRequire(filename) }, { filename })
const Card = module.exports.default
const station = { id: 'test', name: 'Test station', address: '', responderType: 'police', kind: '', lng: 120.87, lat: 14.84 }
const render = (props) => renderToStaticMarkup(React.createElement(Card, { station, scene: null, data: DEFAULT_RESPONDER, ...props }))
test('station cards retain scene boxes, show type names, and require a scene to request', () => {
  const html = render({})
  assert.match(html, /Police Station/)
  assert.ok(!html.includes('Number needed'))
  assert.ok(!html.includes('Responder status'))
  assert.ok(!html.includes('Police personnel needed:'))
  assert.ok(!html.includes('Status: En Route'))
  assert.ok(!html.includes('Urgency'))
  assert.match(html, /Address not available/)
  assert.match(html, /Select a report to estimate distance/)
  assert.match(html, /disabled=""[^>]*>.*Request police personnel/)
  assert.ok(!html.includes('Assign officer') && !html.includes('Assign medic'))
  for (const kind of ['Hospital', 'Clinic', 'Ambulance station']) {
    const medical = render({ station: { ...station, responderType: 'medical', kind }, scene })
    assert.equal(medical, '', 'Medical facilities cannot render personnel request cards')
  }
})

test('sent request immediately shows responding and offers completion without acceptance', () => {
  const request = createPersonnelRequest(scene, { personnel: 5, urgency: 'Urgent', note: 'Equipment needed' })
  const html = render({ scene: { ...scene, reportId: 'another-report' }, data: { status: 'Request Sent', request } })
  assert.ok(html.includes(scene.reportId) && !html.includes('another-report'))
  for (const text of [request.id, '5 police personnel', 'Equipment needed', 'Complete scene', 'Cancel request']) assert.ok(html.includes(text))
  assert.ok(!html.includes('Number needed'))
  assert.ok(html.includes('responder-progress'))
  assert.ok(!html.includes('Mark Responding'))
  assert.deepEqual(RESPONDER_STATUSES, ['Request Sent', 'Responding', 'Completed'])
})

test('completion frees the station for another drag while keeping the completed summary', () => {
  const request = createPersonnelRequest(scene, { personnel: 1 })
  const responding = { station, request, status: 'Responding', stationStatus: 'En Route' }
  assert.equal(canRequestPersonnel(responding), false)
  const completed = advancePersonnelRequest(responding, 'Completed')
  assert.equal(completed.stationStatus, 'Available')
  assert.equal(canRequestPersonnel(completed), true)
  assert.equal(canRequestPersonnel(DEFAULT_RESPONDER), true)
  assert.equal(hasPendingArrival(completed), false)
  const html = render({ data: completed })
  assert.ok(html.includes(request.id))
  assert.ok(html.includes('Route complete'))
  assert.ok(html.includes('officer released'))
  assert.ok(!html.includes('Station available'))
  assert.ok(html.includes('Cancel request'))
  for (const removed of ['New request', 'Complete scene', 'responder-progress']) assert.ok(!html.includes(removed))
})

test('confirming arrival retires only the arrived route and keeps its request summary', () => {
  const request = createPersonnelRequest(scene, { personnel: 2 });
  const medical = { station: { ...station, responderType: 'medical' }, request, status: 'Responding' };
  const police = { station, request: { ...request, id: 'another-request' }, status: 'Request Sent' };
  assert.deepEqual([medical, police].filter(hasPendingArrival), [medical, police]);
  const arrived = advancePersonnelRequest(medical, 'Completed');
  assert.deepEqual([arrived, police].filter(hasPendingArrival), [police]);
  assert.equal(arrived.request, request);
  assert.equal(hasPendingArrival(JSON.parse(JSON.stringify(arrived))), false);
  assert.equal(hasPendingArrival(advancePersonnelRequest(arrived, 'Completed')), false);
  assert.equal(hasPendingArrival(DEFAULT_RESPONDER), false);
});

test('shared station cards retain official assignment alongside local request progress and routes', () => {
  const request = createPersonnelRequest(scene, { personnel: 1 })
  const html = render({ scene, enforcerPanel: React.createElement('p', null, 'Official assignment roster'), data: { status: 'Responding', request }, routeInfo: { isFallback: false } })
  assert.match(html, /Official assignment roster/)
  assert.match(html, /RA-2026-001/)
  for (const text of ['Request Personnel', 'Request progress', 'Complete scene', 'Cancel request', 'Browser only', 'Driving route displayed', request.id]) assert.ok(html.includes(text), text)
  const map = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  assert.ok(!map.includes('enforcerClient ? [] : responders.activeRequests'), 'shared routes stay enabled')
})

test('shared station card waits for officer assignment instead of offering a separate send action', () => {
  const html = render({ scene, assignmentRequired: true, data: DEFAULT_RESPONDER })
  assert.match(html, /Assign an available officer above to send the request and start responding/)
  assert.ok(!html.includes('Request police personnel'))
  assert.ok(!html.includes('Request progress'))
  assert.ok(!html.includes('Complete scene'))
})

for (const action of ['Cancel request', 'Complete scene']) test(`${action} disables repeated actions and shows server failures without discarding progress`, async () => {
  const values = []
  let cursor = 0, rejectSave
  const module = { exports: {} }, require = createRequire(filename)
  vm.runInNewContext(transformSync(readFileSync(filename, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports,
    require: name => name === 'react' ? { useState(initial) {
      const slot = cursor++
      if (!(slot in values)) values[slot] = initial
      return [values[slot], value => { values[slot] = value }]
    } } : require(name),
  })
  const request = createPersonnelRequest(scene, { personnel: 1 })
  const save = () => new Promise((_resolve, reject) => { rejectSave = reject })
  const props = { station, scene, assignmentRequired: true, enforcerPanel: React.createElement('p', null, 'Roster'), data: { status: 'Responding', request }, onRelease: save, onStatus: save }
  const render = () => { cursor = 0; return module.exports.default(props) }
  function find(node, predicate) {
    if (!React.isValidElement(node)) return null
    if (predicate(node)) return node
    for (const child of React.Children.toArray(node.props.children)) {
      const result = find(child, predicate)
      if (result) return result
    }
    return null
  }
  let tree = render()
  const pending = find(tree, node => node.type === 'button' && node.props.children === action).props.onClick()
  tree = render()
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Saving…').props.disabled, true)
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Complete scene').props.disabled, true)
  rejectSave(Error('This report changed. Refresh it before saving.'))
  await pending
  tree = render()
  assert.match(find(tree, node => node.props.role === 'alert').props.children, /report changed/)
  const html = renderToStaticMarkup(tree)
  assert.ok(html.includes(request.id))
  assert.ok(html.includes('cancellation') || html.includes('Cancelling this request also releases'))
  assert.equal(find(tree, node => node.type === 'button' && node.props.children === 'Cancel request').props.disabled, false)
})

test('demo and shared requests persist independently and restore their route snapshots', () => {
  const filename = fileURLToPath(new URL('../src/hooks/useResponderState.js', import.meta.url))
  const storage = new Map()
  function mount() {
    const values = [], effects = []
    let cursor = 0
    const hooks = {
      useState(initial) {
        const slot = cursor++
        if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial
        return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
      },
      useEffect: fn => effects.push(fn), useCallback: fn => fn, useMemo: fn => fn(),
    }
    const module = { exports: {} }, require = createRequire(filename)
    vm.runInNewContext(transformSync(readFileSync(filename, 'utf8'), { format: 'cjs' }).code, {
      module, exports: module.exports,
      require: name => name === 'react' ? hooks : require(name),
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    })
    return () => {
      cursor = 0; effects.length = 0
      const demo = module.exports.default(null)
      const shared = module.exports.default(null, 'roadsafe:responders:shared:v3')
      effects.forEach(fn => fn())
      return { demo, shared }
    }
  }
  let render = mount(), state = render()
  state.demo.requestAssistance(station.id, scene, { personnel: 2 }, station)
  state = render()
  assert.equal(state.demo.activeRequests.length, 1)
  assert.equal(state.shared.activeRequests.length, 0)
  state.shared.requestAssistance(station.id, { ...scene, reportId: 'shared-report' }, { personnel: 1 }, station)
  state = render()
  assert.equal(state.demo.get(station.id).request.reportId, scene.reportId)
  assert.equal(state.shared.get(station.id).request.reportId, 'shared-report')
  render = mount(); state = render()
  assert.equal(state.demo.activeRequests[0].request.reportId, scene.reportId)
  assert.equal(state.shared.activeRequests[0].request.reportId, 'shared-report')
  state.shared.setStatus(station.id, 'Completed')
  state = render()
  assert.equal(state.shared.activeRequests.length, 0)
  assert.equal(state.demo.activeRequests.length, 1)
})
