import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { reportsResponse } from '../src/data/reports.js'

function setup(status, extra = {}, props = {}) {
  const report = { ...structuredClone(reportsResponse.data[0]), status, assignedOfficerId: null, ...extra }
  const values = [], saves = []
  let cursor = 0
  const url = new URL('../src/components/ReportModal.jsx', import.meta.url), require = createRequire(url), module = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return { ...React, useEffect() {}, useRef: () => ({ current: null }), useState(initial) {
        const slot = cursor++
        if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial
        return [values[slot], next => { values[slot] = next }]
      } }
      if (name === './CategoryContext.js') return { useCategoryLabel: () => id => id, useCategories: () => [] }
      return require(name)
    },
  })
  const render = () => { cursor = 0; return module.exports.default({ report, users: reportsResponse.included.users, embedded: true, live: true, onSave: (...args) => saves.push(args), ...props }) }
  function find(node, predicate) {
    if (!React.isValidElement(node)) return null
    if (predicate(node)) return node
    for (const child of React.Children.toArray(node.props.children)) { const found = find(child, predicate); if (found) return found }
    return null
  }
  const button = label => find(render(), node => node.type === 'button' && node.props.children === label)
  const submit = () => find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  const input = label => find(render(), node => node.props['aria-label'] === label)
  return { report, saves, render, button, submit, input }
}

test('review action needs confirmation and a normal remarks save preserves the current status', async () => {
  const ui = setup('Submitted')
  await ui.submit()
  assert.equal(ui.saves[0][1].status, 'Submitted')
  ui.button('Start review').props.onClick()
  assert.equal(ui.saves.length, 1)
  await ui.submit()
  assert.equal(ui.saves[1][1].status, 'Under Review')
})

test('rejection requires a reason and cancelling the action preserves review', async () => {
  const ui = setup('Under Review')
  ui.button('Reject report').props.onClick()
  await ui.submit()
  assert.equal(ui.saves.length, 0)
  ui.input('Rejection reason').props.onChange({ target: { value: 'Not a traffic incident' } })
  await ui.submit()
  assert.equal(ui.saves[0][1].status, 'Rejected')
  assert.equal(ui.saves[0][1].rejectionReason, 'Not a traffic incident')
  ui.button('Cancel action').props.onClick()
  await ui.submit()
  assert.equal(ui.saves[1][1].status, 'Under Review')
})

test('return to review requires a reason and explicitly ends the assignment', async () => {
  const ui = setup('Assigned', { assignedOfficerId: 'officer-mark' })
  ui.button('Return to review').props.onClick()
  await ui.submit()
  assert.equal(ui.saves.length, 0)
  ui.input('Return to review reason').props.onChange({ target: { value: 'Location needs correction' } })
  await ui.submit()
  assert.equal(ui.saves[0][1].status, 'Under Review')
  assert.equal(ui.saves[0][1].assignedOfficerId, null)
  assert.match(ui.saves[0][1].officialRemarks, /Return to review: Location needs correction/)
  assert.equal(ui.report.assignedOfficerId, 'officer-mark')
})

test('Officer verification is an explicit action and assigned progress remains scoped', async () => {
  const ui = setup('Submitted', {}, { actorRole: 'Officer', viewerId: 'officer-mark' })
  assert.equal(ui.button('Choose an action').props.disabled, true)
  ui.button('Verify report').props.onClick()
  assert.equal(ui.button('Confirm action').props.disabled, false)
  await ui.submit()
  assert.equal(ui.saves[0][1].status, 'Verified')
  const assigned = setup('Assigned', { assignedOfficerId: 'officer-mark' }, { actorRole: 'Officer', viewerId: 'officer-mark' })
  assert.ok(assigned.button('Start responding'))
  assert.equal(assigned.button('Return to review'), null)
})
