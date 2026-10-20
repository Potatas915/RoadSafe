import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { nearestFacilities, facilityDistance } from '../src/models/medicalFacilities.js'
import { saveMedicalRecommendation, getMedicalRecommendation } from '../src/backend/medicalRecommendations.js'
const hospital = { id: 'node/1', name: 'Hospital <safe>', kind: 'Hospital', address: 'Test road', lat: 14.851, lng: 120.88 }
const clinic = { ...hospital, id: 'node/2', name: 'Clinic', kind: 'Clinic', lat: 14.852 }
test('nearest facilities exclude ambulance stations, malformed coordinates and out-of-area locations', () => {
 const nearest = nearestFacilities([clinic, hospital, { ...hospital, kind: 'Ambulance Station' }, { ...hospital, lat: NaN }, { ...hospital, lat: 16 }], [120.88, 14.85], 2.5)
 assert.deepEqual(nearest.map(item => item.id), ['node/1', 'node/2'])
 assert.equal(facilityDistance(hospital, [hospital.lng, hospital.lat]), 0)
 assert.deepEqual(nearestFacilities([hospital], null), [])
})
const filename = fileURLToPath(new URL('../src/components/MedicalFacilityCard.jsx', import.meta.url))
const module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(filename, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, { module, exports: module.exports, require: createRequire(filename) }, { filename })
test('medical card contains location and recommendations without personnel, status or routes', () => {
 const html = renderToStaticMarkup(React.createElement(module.exports.default, { station: hospital, scene: { reportId: 'incident', label: 'Collision', coordinates: [120.88, 14.85] }, nearby: nearestFacilities([hospital, clinic], [120.88, 14.85]), selectedId: hospital.id }))
 for (const text of ['Hospital &lt;safe&gt;', 'Nearest mapped hospitals', 'straight-line distance', 'Recommend this facility', 'Recommended', 'acceptance are unconfirmed']) assert.ok(html.includes(text), text)
 for (const text of ['Request personnel', 'Request medical', 'Responder status', 'ETA', 'Driving route', 'Available']) assert.ok(!html.includes(text), text)
})
test('shared recommendation RPC carries version and location snapshots; errors remain visible', async () => {
 const calls = []
 const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { selectedId: hospital.id }, error: null } } }
 await saveMedicalRecommendation(client, { id: 'report', version: 4 }, hospital.id, [hospital])
 assert.equal(calls[0].name, 'set_medical_recommendation')
 assert.equal(calls[0].args.p_version, 4)
 assert.deepEqual(calls[0].args.p_facilities, [hospital])
 assert.equal((await getMedicalRecommendation(client, 'report')).selectedId, hospital.id)
 await assert.rejects(saveMedicalRecommendation(client, { sample: true }, hospital.id, [hospital]))
 await assert.rejects(getMedicalRecommendation({ rpc: async () => ({ error: new Error('Denied') }) }, 'report'), /Denied/)
})
