import test from 'node:test'
import assert from 'node:assert/strict'
import { previewRoute, fetchRoute, drawRoute, focusRoute, routePadding } from '../src/services/routing.js'
const from = [120.9, 14.8], to = [120.92, 14.82]

test('route camera reserves visible space beside or above the station card', () => {
  const card = { offsetWidth: 320, offsetHeight: 290 }
  assert.equal(routePadding(693, 458, card).left, 356)
  const phone = routePadding(350, 458, card)
  assert.equal(phone.bottom, 326)
  assert.ok(458 - phone.top - phone.bottom >= 100)
})

test('routes reject invalid endpoints and retain a preview on provider failure', async () => {
  assert.equal(previewRoute([null, 14], to), null)
  assert.equal(previewRoute([181, 14], to), null)
  const route = await fetchRoute(from, to, { fetchImpl: async () => { throw Error('offline') } })
  assert.equal(route.isFallback, true)
  assert.deepEqual(route.geometry.coordinates, [from, to])
})

test('provider geometry upgrades the preview; malformed responses fall back', async () => {
  const geometry = { type: 'LineString', coordinates: [from, [120.91, 14.81], to] }
  const route = await fetchRoute(from, to, { fetchImpl: async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry }] }) }) })
  assert.equal(route.isFallback, false)
  assert.deepEqual(route.geometry, geometry)
  assert.equal((await fetchRoute(from, to, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).isFallback, true)
})

test('map route layers display medical geometry, frame endpoints and clear on cancellation', () => {
  const sources = new Map(), layers = new Map()
  let data, bounds, options
  const map = {
    getSource: id => sources.get(id), addSource: id => sources.set(id, { setData: value => { data = value } }),
    getLayer: id => layers.get(id), addLayer: layer => layers.set(layer.id, layer), moveLayer() {},
    getContainer: () => ({ clientWidth: 693, clientHeight: 458, parentElement: { querySelector: () => ({ offsetWidth: 320, offsetHeight: 282 }) } }),
    fitBounds: (value, settings) => { bounds = value; options = settings },
  }
  const route = previewRoute(from, to)
  drawRoute(map, route, 'medical')
  assert.equal(layers.size, 3)
  assert.equal(data.features[0].properties.responderType, 'medical')
  assert.deepEqual(data.features[0].geometry.coordinates, [from, to])
  focusRoute(map, route)
  assert.deepEqual(bounds, [from, to])
  assert.equal(options.padding.left, 356)
  drawRoute(map, null)
  assert.equal(layers.size, 3)
  assert.deepEqual(data.features, [])
})
