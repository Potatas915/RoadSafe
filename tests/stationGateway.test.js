import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchStationArea, stationQuery, stationMiddleware, nationwideStations } from '../server/stations.mjs'

const bounds = [14.5, 120.9, 14.7, 121.1]
test('gateway builds only allowed police/medical queries for bounded areas', () => {
  assert.match(stationQuery('police', bounds), /nwr\["amenity"="police"\]/)
  assert.match(stationQuery('medical', bounds), /ambulance_station/)
  for (const [type, area] of [['arbitrary', bounds], ['__proto__', bounds], ['police', [-80, -180, 80, 180]], ['police', [0, 1, 0, 1]]]) assert.throws(() => stationQuery(type, area))
})

test('nationwide queries select the Philippines administrative area, with no incident or radius', () => {
  for (const type of ['police', 'medical']) {
    const query = stationQuery(type, null, 'philippines')
    assert.ok(query.includes('["ISO3166-1"="PH"]'))
    assert.ok(query.includes('(area.country)'))
    assert.ok(!query.includes('around:'))
  }
  assert.throws(() => stationQuery('police', null, 'unrestricted'))
})

test('nationwide snapshots survive provider outages and fresh snapshots avoid network work', async () => {
  const elements = [{ id: 1 }]
  const fresh = { savedAt: Date.now(), elements }
  assert.deepEqual(await nationwideStations('medical', () => { throw Error('must not fetch') }, { read: async () => fresh }), { elements })
  const stale = { savedAt: Date.now() - 8 * 86400000, elements }
  const result = await nationwideStations('medical', async () => ({ ok: false, status: 500 }), { read: async () => stale })
  assert.deepEqual(result.elements, elements)
  assert.match(result.warning, /saved station geography/)
})

test('empty country data is not treated as a successful nationwide download', async () => {
  await assert.rejects(fetchStationArea('medical', null, async () => ({ ok: true, json: async () => ({ elements: [] }) }), 'philippines'), /country dataset unavailable/)
})

test('bundled hosting snapshots serve stale geography immediately with its real date', async () => {
  const savedAt = Date.now() - 8 * 86400000
  let calls = 0
  const result = await nationwideStations('police', () => { calls++; throw Error('must not fetch') }, {
    preferSaved: true,
    read: async () => ({ savedAt, elements: [{ id: 17 }] }),
  })
  assert.deepEqual(result.elements, [{ id: 17 }])
  assert.ok(result.warning.includes(new Date(savedAt).toISOString().slice(0, 10)))
  assert.equal(calls, 0)
})

test('gateway identifies RoadSafe upstream and fails over without exposing CORS to the browser', async () => {
  const calls = []
  const result = await fetchStationArea('police', bounds, async (url, options) => {
    calls.push(url)
    assert.match(options.headers['User-Agent'], /RoadSafe-AWA/)
    assert.ok(new URLSearchParams(options.body).get('data').includes(bounds.join(',')))
    return calls.length === 1 ? { ok: false, status: 429 } : { ok: true, json: async () => ({ elements: [{ id: 1 }] }) }
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(result, { elements: [{ id: 1 }] })
})

test('both unavailable providers produce a useful service error rather than a false empty search', async () => {
  await assert.rejects(fetchStationArea('medical', bounds, async () => ({ ok: false, status: 504 })), /temporarily unavailable.*HTTP 504/)
})

async function invoke(handler, url, method = 'GET') {
  const res = { headers: {}, destroyed: false, setHeader(key, value) { this.headers[key] = value }, end(body) { this.body = body } }
  await handler({ url, method }, res, () => { res.next = true })
  return res
}
test('same-origin station route serves results and caches identical requests', async () => {
  let calls = 0
  const handler = stationMiddleware(async () => { calls++; return { ok: true, json: async () => ({ elements: [{ id: 321 }] }) } })
  const url = '/api/stations?type=police&bounds=15,121,15.1,121.1'
  assert.deepEqual(JSON.parse((await invoke(handler, url)).body), { elements: [{ id: 321 }] })
  await invoke(handler, url)
  assert.equal(calls, 1)
  assert.equal((await invoke(handler, '/api/stations?type=bad&bounds=1,2,3,4')).statusCode, 400)
  assert.equal((await invoke(handler, url, 'POST')).statusCode, 405)
  assert.equal((await invoke(handler, '/other')).next, true)
})
