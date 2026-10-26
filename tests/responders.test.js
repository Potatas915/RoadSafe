import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canRequestPersonnel, hasPendingArrival, createPersonnelRequest, advancePersonnelRequest, DEFAULT_RESPONDER, RESPONDER_STATUSES } from '../src/data/responders.js'

const scene = { reportId: 'RA-2026-001', label: 'Collision', coordinates: [120.88, 14.85] }
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
  assert.match(html, /Status: Available/)
  assert.match(html, /Status: En Route/)
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
  assert.ok(html.includes('Station available'))
  for (const removed of ['New request', 'Complete scene', 'Cancel request', 'responder-progress']) assert.ok(!html.includes(removed))
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

test('shared station cards show assignment without local request progress or completion', () => {
  const request = createPersonnelRequest(scene, { personnel: 1 })
  const html = render({ scene, preview: false, enforcerPanel: React.createElement('p', null, 'Official assignment roster'), data: { status: 'Responding', request } })
  assert.match(html, /Official assignment roster/)
  assert.match(html, /RA-2026-001/)
  for (const text of ['Request Personnel', 'Request progress', 'Complete scene', 'Cancel request', 'Browser only', request.id]) assert.ok(!html.includes(text), text)
})
