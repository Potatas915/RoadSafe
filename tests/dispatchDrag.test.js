import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'
import { routePrefix } from '../src/services/routing.js'

function setup({ busy = false, personnel = 1, stationHit = true, layersAvailable = true } = {}) {
  const refs = [], effects = [], canvasEvents = new Map(), events = new Map(), frames = new Map()
  let sequence = 0, enabled = true, captured = false, target = true
  const calls = []
  const station = { properties: { id: 'station-1', name: 'Station' }, geometry: { coordinates: [10, 10] }, layer: { id: 'roadsafe-police-stations-layer' } }
  const incident = { properties: { id: 'incident-1' }, geometry: { coordinates: [100, 100] } }
  const canvas = { style: {}, addEventListener: (name, fn) => canvasEvents.set(name, fn), removeEventListener: name => canvasEvents.delete(name), setPointerCapture: () => { captured = true }, hasPointerCapture: () => captured, releasePointerCapture: () => { captured = false } }
  const map = {
    getCanvas: () => canvas,
    getContainer: () => ({ clientWidth: 400, clientHeight: 300, getBoundingClientRect: () => ({ left: 20, top: 30, width: 400, height: 300 }) }),
    getLayer: () => layersAvailable,
    queryRenderedFeatures: (where, { layers }) => {
      assert.ok(Array.isArray(where), 'MapLibre geometry must be an array, never a plain point object')
      return layers.includes('roadsafe-report-points') ? (target ? [incident] : []) : stationHit ? [station] : []
    },
    project: ([x, y]) => ({ x, y }),
    dragPan: { isEnabled: () => enabled, disable: () => { enabled = false }, enable: () => { enabled = true } },
    on: (name, fn) => events.set(name, fn), off: name => events.delete(name),
  }
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  const code = transformSync(readFileSync(new URL('../src/components/DispatchDrag.jsx', import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => name.endsWith('.css') ? {} : name === 'react' ? {
      useRef: value => { const ref = { current: value }; refs.push(ref); return ref },
      useEffect: fn => effects.push(fn), useState: () => ['', () => {}],
    } : require(name),
    window: { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout: () => 1, clearTimeout() {},
  })
  module.exports.default({ mapRef: { current: map }, ready: true, getPersonnel: () => personnel, canDispatch: () => !busy, onDispatch: (...args) => calls.push(args) })
  const labels = { span: {}, small: {} }
  for (const ref of refs.slice(0, 3)) ref.current = { style: {}, dataset: {}, querySelector: name => labels[name], setAttribute() {} }
  const cleanup = effects[1]()
  const event = (x, y) => ({ clientX: x + 20, clientY: y + 30, pointerId: 1, button: 0, isPrimary: true, preventDefault() {} })
  return { calls, refs, labels, canvasEvents, events, cleanup,
    down: (x = 10, y = 10) => canvasEvents.get('pointerdown')(event(x, y)),
    move: (x = 100, y = 100) => { events.get('pointermove')(event(x, y)); for (const [id, fn] of frames) { frames.delete(id); fn() } },
    up: (x = 100, y = 100) => events.get('pointerup')(event(x, y)),
    noTarget: () => { target = false }, enabled: () => enabled,
  }
}

test('station drag locks a rendered incident, dispatches once and restores map panning', () => {
  const ui = setup()
  ui.down(); assert.equal(ui.enabled(), false)
  ui.move(); assert.equal(ui.refs[0].current.dataset.locked, 'true')
  assert.equal(ui.refs[0].current.style.transform, 'translate(100px, 100px)')
  ui.up(); assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0][0].responderType, 'police')
  assert.equal(ui.calls[0][1].properties.id, 'incident-1'); assert.equal(ui.enabled(), true)
  let suppressed = false
  ui.canvasEvents.get('click')({ preventDefault() {}, stopImmediatePropagation() { suppressed = true } })
  assert.equal(suppressed, true)
  ui.cleanup(); assert.equal(ui.events.size, 0); assert.equal(ui.canvasEvents.size, 0)
})

test('empty-map clicks and unavailable station layers cannot start a station drag', () => {
  for (const options of [{ stationHit: false }, { layersAvailable: false }, {}]) {
    const ui = setup(options)
    ui.down(250, 250); ui.move(); ui.up()
    assert.equal(ui.calls.length, 0)
    assert.equal(ui.enabled(), true)
    assert.notEqual(ui.refs[0].current.dataset.active, 'true')
    ui.cleanup()
  }
})

test('drag HUD uses the selected personnel count', () => {
  const ui = setup({ personnel: 4 })
  ui.down(); ui.move()
  assert.equal(ui.labels.small.textContent, '4 PERSONNEL · LOCAL SIM')
  ui.up(); ui.cleanup()
})

test('clicks, invalid drops, outside-map drops, Escape and pointer cancellation never create requests', () => {
  for (const mode of ['click', 'invalid', 'outside', 'escape', 'pointercancel', 'blur']) {
    const ui = setup(); ui.down()
    if (mode !== 'click') ui.move()
    if (mode === 'invalid') ui.noTarget()
    if (mode === 'escape') ui.events.get('keydown')({ key: 'Escape' })
    else if (['pointercancel', 'blur'].includes(mode)) ui.events.get(mode)()
    else ui.up(...(mode === 'outside' ? [401, 100] : mode === 'click' ? [10, 10] : [100, 100]))
    assert.equal(ui.calls.length, 0, mode); assert.equal(ui.enabled(), true, mode)
    ui.cleanup()
  }
  const ui = setup({ busy: true }); ui.down(); ui.move(); ui.up()
  assert.equal(ui.calls.length, 0); assert.equal(ui.enabled(), true); ui.cleanup()
})

test('route reveal interpolates across unequal road segments and two-point previews', () => {
  const coordinates = [[0, 0], [3, 0], [3, 1]]
  assert.deepEqual(routePrefix(coordinates, .5), [[0, 0], [2, 0]])
  assert.deepEqual(routePrefix(coordinates, .875), [[0, 0], [3, 0], [3, .5]])
  assert.deepEqual(routePrefix([[0, 0], [10, 0]], .5), [[0, 0], [5, 0]])
  assert.deepEqual(routePrefix(coordinates, 1), coordinates)
})
