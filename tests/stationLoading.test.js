import test from 'node:test'
import assert from 'node:assert/strict'
import { createStationLoader, stationSearchBounds } from '../src/services/stationLoader.js'
import { filterByRadius, loadPoliceStations } from '../src/services/policeStations.js'
import { loadMedicalStations } from '../src/services/medicalStations.js'

const manila = [120.9842, 14.5995]
const malolos = [120.8114, 14.8433]
const legazpi = [123.7438, 13.1391]
const police = () => createStationLoader('police', ['["amenity"="police"]'], () => 'Police Station')
function storage(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const items = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) } })
  t.after(() => original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage)
  return items
}
const response = (elements) => ({ ok: true, json: async () => ({ elements }) })
const station = (id, lng, lat, tags = {}) => ({ type: 'node', id, lon: lng, lat, tags })

test('search bounds cover every supported radius around Bulacan, Manila and Bicol', () => {
  for (const center of [malolos, manila, legazpi, [121.727, 17.6132]]) {
    for (const radius of [1, 1.5, 2, 2.5, 3, 3.5, 10]) {
      const [south, west, north, east] = stationSearchBounds(center, radius)
      assert.ok(south <= center[1] - radius / 110.574 && north >= center[1] + radius / 110.574)
      const dLng = radius / (111.32 * Math.cos(center[1] * Math.PI / 180))
      assert.ok(west <= center[0] - dLng && east >= center[0] + dLng)
    }
  }
  assert.throws(() => stationSearchBounds(undefined, 2.5), /valid/)
  const candidates = [station(1, ...manila), station(2, manila[0], manila[1] + .01), station(3, ...malolos)]
    .map((item) => ({ id: item.id, lng: item.lon, lat: item.lat }))
  assert.deepEqual(filterByRadius(candidates, manila, 2.5).map(({ id }) => id), [1, 2])
})

test('area caches cannot substitute Bulacan results for Manila or Bicol; old v1 cache is ignored', async (t) => {
  const items = storage(t)
  items.set('roadsafe:police-stations:v1', JSON.stringify({ savedAt: Date.now(), stations: [{ id: 'old' }] }))
  const queries = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    queries.push(new URL(url, 'http://localhost').searchParams.get('bounds'))
    return response([station(queries.length, ...manila)])
  })
  const load = police()
  for (const center of [malolos, manila, legazpi]) await load({ center, radiusKm: 2.5 })
  assert.equal(queries.length, 3)
  assert.equal(new Set(queries).size, 3)
  assert.ok(queries[1].includes(stationSearchBounds(manila, 2.5).join(',')))
  await load({ center: manila, radiusKm: 2.5 })
  await police()({ center: manila, radiusKm: 2.5 })
  assert.equal(queries.length, 3, 'memory and persisted area cache both work')
  assert.ok(items.has('roadsafe:police-stations:v1'), 'historical cache is preserved')
})

test('both real loaders query the chosen area and normalize nodes, ways and relations', async (t) => {
  storage(t)
  const queries = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    queries.push(url)
    return response([station(1, ...manila, { amenity: 'hospital', name: 'Example hospital' }),
      { type: 'relation', id: 2, center: { lon: manila[0], lat: manila[1] }, tags: { emergency: 'ambulance_station' } },
      { type: 'way', id: 3, center: { lon: manila[0], lat: manila[1] }, tags: { amenity: 'clinic' } }])
  })
  const policeResult = await loadPoliceStations({ center: manila, radiusKm: 10, force: true })
  const medicalResult = await loadMedicalStations({ center: manila, radiusKm: 10, force: true })
  assert.equal(policeResult[0].kind, 'Police Station')
  assert.equal(medicalResult[0].kind, 'Hospital')
  assert.equal(medicalResult[1].kind, 'Ambulance Station')
  assert.equal(medicalResult[2].kind, 'Clinic')
  assert.ok(queries[0].startsWith('/api/stations?type=police&'))
  assert.ok(queries[1].startsWith('/api/stations?type=medical&'))
})

test('hiding a layer aborts an in-flight station request without starting fallback', async (t) => {
  storage(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    calls++
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
    })
  })
  const controller = new AbortController()
  const pending = police()({ center: manila, radiusKm: 2.5, signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('failed/partial gateway responses are not cached and allow retry', async (t) => {
  storage(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return { ok: true, json: async () => calls === 1 ? { remark: 'timeout', elements: [] } : { elements: [] } }
  })
  const load = police()
  await assert.rejects(load({ center: manila, radiusKm: 2.5 }), /timeout/)
  assert.deepEqual(await load({ center: manila, radiusKm: 2.5 }), [])
  assert.equal(calls, 2)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(load({ center: legazpi, radiusKm: 2.5, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 2)
})

test('provider outage details and missing station API are shown instead of generic fetch errors', async (t) => {
  storage(t)
  const mock = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => ({ error: 'Station data providers are temporarily unavailable (HTTP 503).' }) }))
  await assert.rejects(police()({ center: manila, radiusKm: 2.5 }), /temporarily unavailable.*HTTP 503/)
  mock.mock.mockImplementation(async () => ({ ok: true, headers: { get: () => 'text/html' } }))
  await assert.rejects(police()({ center: manila, radiusKm: 2.5 }), /station API is missing/)
})

test('nationwide loads do not require a selected report, center, or radius', async (t) => {
  storage(t)
  let requested
  t.mock.method(globalThis, 'fetch', async (url) => { requested = url; return response([station(1, 125.6, 7.1), station(2, ...manila)]) })
  const result = await police()({ nationwide: true })
  assert.equal(result.length, 2)
  assert.equal(requested, '/api/stations?type=police&scope=philippines')
})

test('startup and deployment share the national download; cancellation preserves cache for other incidents', async (t) => {
  storage(t)
  let calls = 0, finish
  t.mock.method(globalThis, 'fetch', () => {
    calls++
    return new Promise((resolve) => { finish = () => resolve(response([station(1, ...manila), station(2, ...legazpi)])) })
  })
  const load = police()
  const warmup = load({ nationwide: true })
  const controller = new AbortController()
  const cancelled = load({ nationwide: true, signal: controller.signal })
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  const deployment = load({ nationwide: true })
  finish()
  await warmup
  const all = await deployment
  assert.equal(calls, 1)
  assert.equal(filterByRadius(all, manila, 2.5)[0].id, 'node/1')
  assert.equal(filterByRadius(await load({ nationwide: true }), legazpi, 10)[0].id, 'node/2')
  assert.equal(calls, 1, 'another incident and radius reuse the national cache')
})

test('a failed nationwide preload can be retried successfully', async (t) => {
  storage(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? { ok: false, json: async () => ({ error: 'Provider unavailable' }) }
    : response([station(1, ...manila)]))
  const load = police()
  await assert.rejects(load({ nationwide: true }), /Provider unavailable/)
  assert.equal((await load({ nationwide: true })).length, 1)
  assert.equal(calls, 2)
})
