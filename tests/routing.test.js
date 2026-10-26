import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { visibleReportRoutes, previewRoute, fetchRoute, drawRoute, drawRoutes, focusRoute, routePadding } from '../src/services/routing.js'
const from = [120.9, 14.8], to = [120.92, 14.82]

test('map automatically creates a fallback route and upgrades it after a personnel request in either mode', async () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  const effect = source.match(/useEffect\(\(\) => \{\s*if \(!mapReady\) return;([\s\S]*?)\}, \[mapReady, activeRequests\]\);/)[1]
  for (const shared of [false, true]) {
    let routes = {}, resolveRoute
    const road = { geometry: { type: 'LineString', coordinates: [from, [120.91, 14.81], to] }, isFallback: false }
    const cleanup = vm.runInNewContext('(() => {' + effect + '})()', {
      enforcerClient: shared ? {} : null, AbortController,
      activeRequests: [{ station: { lng: from[0], lat: from[1], responderType: 'police' }, request: { id: 'request', reportId: 'incident', sceneCoordinates: to } }],
      routeCache: { current: new Map() }, previewRoute,
      fetchRoute: () => new Promise(resolve => { resolveRoute = resolve }),
      setRoutes: next => { routes = typeof next === 'function' ? next(routes) : next },
    })
    assert.equal(routes.request.route.isFallback, true)
    const map = { querySourceFeatures: () => [{ properties: { id: 'incident' } }] }
    assert.equal(visibleReportRoutes(map, Object.values(routes), 'incident').length, 1)
    resolveRoute(road)
    await Promise.resolve()
    assert.equal(routes.request.route, road)
    cleanup()
  }
})

test('routes hide for clustered or filtered accidents and return for individual accidents', () => {
  const routes = [{ reportId: 'A' }, { reportId: 'B' }]
  let features = [{ properties: { cluster: true, point_count: 2 } }]
  const map = { querySourceFeatures: () => features }
  assert.deepEqual(visibleReportRoutes(map, routes, 'A'), [])
  features = [{ properties: { id: 'A' } }, { properties: { id: 'A' } }]
  assert.deepEqual(visibleReportRoutes(map, routes, 'A'), [routes[0]])
  features = [{ properties: { id: 'A' } }, { properties: { id: 'B' } }]
  assert.deepEqual(visibleReportRoutes(map, routes, 'A'), [routes[0]])
  assert.deepEqual(visibleReportRoutes(map, routes, 'B'), [routes[1]])
  assert.deepEqual(visibleReportRoutes(map, routes, null), [])
  assert.deepEqual(visibleReportRoutes(map, routes, 'C'), [])
})

test('response station snapshots follow the same selected and unclustered accidents as routes', () => {
  const stationA = { id: 'station-A' }, stationB = { id: 'station-B' }
  const responses = [{ reportId: 'A', station: stationA }, { reportId: 'B', station: stationB }]
  let features = [{ properties: { id: 'A' } }, { properties: { id: 'B' } }]
  const map = { querySourceFeatures: () => features }
  const stations = selection => visibleReportRoutes(map, responses, selection).map(entry => entry.station)
  assert.deepEqual(stations('A'), [stationA])
  assert.deepEqual(stations('B'), [stationB])
  assert.deepEqual(stations(null), [])
  features = [{ properties: { point_count: 2 } }]
  assert.deepEqual(stations('B'), [])
})

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

test('medical and police routes coexist and cancelling one retains the other', () => {
  const sources = new Map(), layers = new Map();
  let data;
  const map = {
    getSource: id => sources.get(id), addSource: id => sources.set(id, { setData: value => { data = value } }),
    getLayer: id => layers.get(id), addLayer: layer => layers.set(layer.id, layer), moveLayer() {},
  };
  const medical = { route: previewRoute(from, to), responderType: 'medical' };
  const police = { route: previewRoute([120.89, 14.79], to), responderType: 'police' };
  drawRoutes(map, [medical, police]);
  assert.deepEqual(data.features.map(f => f.properties.responderType), ['medical', 'police']);
  drawRoutes(map, [medical]);
  assert.equal(data.features.length, 1);
  assert.deepEqual(data.features[0].geometry, medical.route.geometry);
  drawRoutes(map, []);
  assert.equal(data.features.length, 0);
});
