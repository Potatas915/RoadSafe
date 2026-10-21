import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import IncidentPhotoCarousel from '../src/components/IncidentPhotoCarousel.js'
const image = id => ({ id, url: `/photo-${id}.jpg`, mimeType: 'image/jpeg', fileName: `Photo ${id}` })
const render = (evidence, compact = false) => renderToStaticMarkup(React.createElement(IncidentPhotoCarousel, { evidence, compact }))
test('one or two photos stay static and side by side without carousel controls', () => {
  for (const photos of [[image('a')], [image('a'), image('b')]]) {
    const html = render(photos)
    assert.equal((html.match(/<img /g) ?? []).length, photos.length)
    assert.ok(html.includes('incident-photo-pair'))
    assert.ok(!html.includes('carousel'))
    assert.ok(!html.includes('<button'))
    assert.ok(html.includes('href="/photo-a.jpg"'))
  }
})
test('three or more photos use angled neighbors without arrows or numbering', () => {
  const html = render([image('a'), image('b'), image('c')])
  assert.ok(html.includes('incident-photo-coverflow'))
  assert.ok(html.includes('rotateY(32deg)') && html.includes('rotateY(-32deg)'))
  assert.ok(html.includes('href="/photo-b.jpg"'))
  assert.ok(!html.includes('<button') && !html.includes('1 / 3'))
})
test('hover previews stay static and unavailable evidence stays safe', () => {
  const html = render([image('a'), image('b'), image('c')], true)
  assert.ok(!html.includes('carousel') && !html.includes('tabindex') && !html.includes('<a'))
  assert.equal((html.match(/<img /g) ?? []).length, 2)
  assert.ok(render([{ ...image('a'), url: null }, { ...image('b'), mimeType: 'application/pdf' }]).includes('No incident photos available.'))
})

test('loop positions wrap in both directions through repeated complete rotations', async () => {
  const { photoIndex, swipeStep } = await import('../src/components/IncidentPhotoCarousel.js')
  for (const count of [3, 4, 7]) {
    for (let position = -50; position < 50; position++) {
      assert.equal(photoIndex(position + count, count), photoIndex(position, count))
      assert.ok(photoIndex(position, count) >= 0 && photoIndex(position, count) < count)
    }
    assert.equal(photoIndex(-1, count), count - 1)
    assert.equal(photoIndex(count, count), 0)
  }
  assert.equal(swipeStep(-60, 4), 1)
  assert.equal(swipeStep(60, 4), -1)
  assert.equal(swipeStep(10, 4), 0)
  assert.equal(swipeStep(40, 80), 0)
})

test('pointer capture completes repeated swipes and ignores cancelled or vertical gestures', async () => {
  const { readFileSync } = await import('node:fs')
  const vm = await import('node:vm')
  const { transformSync } = await import('esbuild')
  const values = []; let cursor = 0
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: initial => {
      const slot = cursor++; if (!(slot in values)) values[slot] = initial
      return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
    },
    useRef: initial => { const slot = cursor++; return values[slot] ?? (values[slot] = { current: initial }) },
  }
  const module = { exports: {} }
  const code = transformSync(readFileSync(new URL('../src/components/IncidentPhotoCarousel.js', import.meta.url), 'utf8'), { format: 'cjs' }).code
  vm.runInNewContext(code, { module, exports: module.exports, require: () => react })
  const photos = [image('a'), image('b'), image('c')]
  const renderSlides = () => {
    cursor = 0
    const wrapper = module.exports.default({ evidence: photos })
    return wrapper.type(wrapper.props)
  }
  const event = (x, y = 0) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, stopPropagation() {}, currentTarget: { setPointerCapture() {} } })
  for (let step = 0; step < 9; step++) {
    let viewer = renderSlides().children[0]
    viewer.props.onPointerDown(event(100))
    viewer.props.onPointerMove(event(30))
    viewer = renderSlides().children[0]
    viewer.props.onPointerUp(event(30))
    viewer.props.onLostPointerCapture()
    assert.equal(renderSlides().children[1].props.href, photos[(2 + step) % 3].url)
  }
  const before = renderSlides().children[1].props.href
  let viewer = renderSlides().children[0]
  viewer.props.onPointerDown(event(100)); viewer.props.onPointerUp(event(95, 80))
  assert.equal(renderSlides().children[1].props.href, before)
  viewer = renderSlides().children[0]
  viewer.props.onPointerDown(event(100)); viewer.props.onPointerCancel(); viewer.props.onPointerUp(event(0))
  assert.equal(renderSlides().children[1].props.href, before)
})
