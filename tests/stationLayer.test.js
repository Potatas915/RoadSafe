import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { filterByRadius } from '../src/services/policeStations.js'

function layer(loadStations) {
  const states = []
  let cursor = 0
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value }] },
    useRef(initial) { const i = cursor++; return states[i] ??= { current: initial } },
    useEffect() {}, useCallback: callback => callback,
  }
  const module = { exports: {} }
  const code = transformSync(readFileSync(new URL('../src/hooks/useStationLayer.js', import.meta.url), 'utf8'), { format: 'cjs' }).code
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, console: { error() {} }, require: name => name === 'react' ? hooks : { filterByRadius } })
  const mapRef = { current: { getCenter: () => ({ lng: 121, lat: 14.6 }), fitBounds() {} } }
  return () => { cursor = 0; return module.exports.default({ id: 'police', loadStations }, mapRef, false, null, 2.5) }
}

test('saved geography and empty searches are notices, while failures are retryable errors with separate details', async () => {
  let fail = false
  const results = [{ id: 'one', lng: 121, lat: 14.6 }]
  results.warning = 'Using saved station geography from yesterday'
  const render = layer(async () => { if (fail) throw new Error('provider: HTTP 429'); return results })
  await render().show()
  assert.equal(render().error, '')
  assert.match(render().notice, /Showing saved data/)
  assert.equal(render().stations.length, 1)
  render().hide()
  assert.equal(render().notice, '')
  fail = true
  await render().show()
  assert.match(render().error, /Couldn’t load police stations right now/)
  assert.equal(render().errorDetails, 'provider: HTTP 429')
  assert.equal(render().deployed, false)
  fail = false
  await render().show()
  assert.equal(render().error, '')
  assert.equal(render().errorDetails, '')
  const empty = layer(async () => [])
  await empty().show()
  assert.equal(empty().error, '')
  assert.match(empty().notice, /No police stations found within 2.5 km/)
})
