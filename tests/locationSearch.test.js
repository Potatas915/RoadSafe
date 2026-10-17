import test from 'node:test'
import assert from 'node:assert/strict'
import { searchLocations } from '../src/services/locationSearch.js'

test('location search validates coordinates, encodes queries and caches repeated searches', async () => {
  let calls = 0
  const request = async (url) => {
    calls++
    assert.equal(url.searchParams.get('q'), 'Malolos & Bulacan')
    return { ok: true, json: async () => ({ features: [
      { geometry: { type: 'Point', coordinates: [120.81, 14.84] }, properties: { name: 'Malolos', city: 'Malolos', country: 'Philippines' } },
      { geometry: { type: 'Point', coordinates: [200, 14] } },
    ] }) }
  }
  const results = await searchLocations(' Malolos & Bulacan ', undefined, request)
  assert.deepEqual(results, [{ coordinates: [120.81, 14.84], label: 'Malolos, Philippines' }])
  assert.deepEqual(await searchLocations('malolos & bulacan', undefined, request), results)
  assert.equal(calls, 1)
})

test('short queries avoid requests and server errors remain visible', async () => {
  assert.deepEqual(await searchLocations('ab', undefined, () => { throw Error('unexpected request') }), [])
  await assert.rejects(searchLocations('unavailable location', undefined, async () => ({ ok: false })), /unavailable/)
  await assert.rejects(searchLocations('invalid response', undefined, async () => ({ ok: true, json: async () => ({}) })), /Invalid/)
})
