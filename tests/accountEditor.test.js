import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const account = { id: 'public', name: 'Jane', role: 'Public', enabled: true, responderType: 'police', unit: 'Legacy', station: null, version: 1 }
function harness(props, globals = {}) {
  let states = [], cursor = 0, effects = [], refs = []
  const hooks = { ...React, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] }, useEffect(effect) { effects.push(effect) }, useRef(initial) { const i = cursor++; const ref = states[i] ??= { current: initial }; refs.push(ref); return ref } }
  const module = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/components/AccountEditor.jsx', import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, { module, exports: module.exports, require: name => name === 'react' ? hooks : require(name), ...globals })
  const render = () => { cursor = 0; effects = []; refs = []; const tree = module.exports.default({ account, ...props }); render.effects = effects; render.refs = refs; return tree }
  return render
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found }
}
test('public account editor is a dialog with basic profile fields and collapsed permissions', () => {
  const tree = harness({})()
  const html = renderToStaticMarkup(tree)
  assert.equal(tree.type, 'dialog')
  assert.match(html, /Display name/)
  assert.doesNotMatch(html, /Account unit/)
  assert.match(html, /<details[^>]*><summary[^>]*>Permissions/)
  assert.doesNotMatch(html, /Station affiliation/)
  assert.doesNotMatch(html, /Close account editor|>Close<\/button>/)
  assert.match(html, /aria-label="Account summary"/)
  assert.match(html, /Profile &amp; access/)
})
test('approval cannot submit without identity confirmation and a station', () => {
  for (const [station, verified] of [[false, false], [true, false], [false, true]]) {
    let submitted = 0
    const render = harness({ account: { ...account, requestedAccountType: 'Officer' }, onSave: () => submitted++ })
    if (station) find(render(), n => n.props?.['aria-label'] === 'Account station').props.onChange({ target: { value: 'station-one' } })
    if (verified) find(render(), n => n.props?.['aria-label'] === 'Identity and credentials verified').props.onChange({ target: { checked: true } })
    const approve = find(render(), n => n.type === 'button' && n.props.children === 'Verify and approve enforcer')
    assert.equal(approve.props.disabled, true)
    approve.props.onClick()
    assert.equal(submitted, 0)
  }
})
test('dirty cancellation retains draft until explicit discard', () => {
  let closed = 0
  const render = harness({ onCancel: () => closed++ })
  find(render(), n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Jane edited' } })
  find(render(), n => n.type === 'button' && n.props.children === 'Cancel').props.onClick()
  assert.equal(closed, 0)
  find(render(), n => n.type === 'button' && n.props.children === 'Discard changes').props.onClick()
  assert.equal(closed, 1)
})
test('stale error stays in modal and blocks saves until reload', () => {
  const render = harness({ stale: true, error: 'Account changed', onReload() {} })
  const tree = render()
  assert.match(renderToStaticMarkup(tree), /Account changed/)
  assert.ok(find(tree, n => n.type === 'button' && n.props.children === 'Reload account'))
  assert.equal(find(tree, n => n.type === 'button' && n.props.children === 'Save account changes').props.disabled, true)
})

test('verified applicant approval needs no typed reason and sends Officer access with an automatic audit note', () => {
  let saved
  const render = harness({ account: { ...account, requestedAccountType: 'Officer' }, onSave: (patch, reason) => { saved = { patch, reason } } })
  for (const [label, target] of [['Account station', { value: 'station-one' }], ['Identity and credentials verified', { checked: true }]]) find(render(), n => n.props?.['aria-label'] === label).props.onChange({ target })
  assert.equal(find(render(), n => n.type === 'button' && n.props.children === 'Verify and approve enforcer').props.disabled, false)
  assert.equal(find(render(), n => n.props?.['aria-label'] === 'Account change reason').props.required, undefined)
  assert.equal(find(render(), n => n.type === 'button' && n.props.children === 'Save account changes').props.disabled, true)
  find(render(), n => n.type === 'button' && n.props.children === 'Verify and approve enforcer').props.onClick()
  assert.equal(saved.patch.role, 'Officer')
  assert.equal(saved.patch.responderType, 'police')
  assert.equal(saved.patch.stationId, 'station-one')
  assert.equal(saved.patch.enabled, true)
  assert.equal(saved.patch.verify, true)
  assert.equal('unit' in saved.patch, false)
  assert.equal(saved.reason, 'Enforcer identity and credentials verified by administrator.')
})
test('suspended applicant must persist reactivation before approval', () => {
  let submitted = 0
  const render = harness({ account: { ...account, enabled: false, requestedAccountType: 'Officer' }, onSave: () => submitted++ })
  for (const [label, target] of [['Account active', { checked: true }], ['Account change reason', { value: 'Verified' }], ['Account station', { value: 'station-one' }], ['Identity and credentials verified', { checked: true }]]) find(render(), n => n.props?.['aria-label'] === label).props.onChange({ target })
  const approve = find(render(), n => n.type === 'button' && n.props.children === 'Verify and approve enforcer')
  assert.equal(approve.props.disabled, true)
  approve.props.onClick()
  assert.equal(submitted, 0)
})
test('saving blocks cancellation and native escape dismissal', () => {
  let closed = 0
  const render = harness({ saving: true, onCancel: () => closed++ })
  const tree = render()
  find(tree, n => n.type === 'button' && n.props.children === 'Cancel').props.onClick()
  let prevented = false
  tree.props.onCancel({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(closed, 0)
})
test('self editing locks role and access, and errors retain the changed name', () => {
  const render = harness({ account: { ...account, role: 'Admin' }, currentUserId: 'public', error: 'Active cases prevent transfer' })
  find(render(), n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Changed name' } })
  const tree = render()
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Account role').props.readOnly, true)
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Account active').props.disabled, true)
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Account name').props.value, 'Changed name')
  assert.match(renderToStaticMarkup(tree), /Active cases prevent transfer/)
})

test('account permissions are fixed and ordinary saves preserve the account role', () => {
  for (const [role, requestedAccountType, label] of [['Public', undefined, 'Public user'], ['Public', 'Officer', 'Enforcer'], ['Officer', 'Officer', 'Enforcer'], ['Admin', undefined, 'Administrator']]) {
    let saved
    const render = harness({ account: { ...account, role, requestedAccountType }, onSave: patch => { saved = patch } })
    const tree = render()
    const type = find(tree, n => n.props?.['aria-label'] === 'Account role')
    assert.equal(type.type, 'input')
    assert.equal(type.props.readOnly, true)
    assert.equal(type.props.value, label)
    assert.equal(type.props.onChange, undefined)
    const responder = find(tree, n => n.props?.['aria-label'] === 'Account responder type')
    if (requestedAccountType === 'Officer' || role === 'Officer') {
      assert.equal(responder.type, 'input')
      assert.equal(responder.props.value, 'Police')
      assert.equal(responder.props.readOnly, true)
      assert.equal(responder.props.onChange, undefined)
    } else assert.equal(responder, undefined)
    find(tree, n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Updated name' } })
    find(render(), n => n.props?.['aria-label'] === 'Account change reason').props.onChange({ target: { value: 'Correct name' } })
    find(render(), n => n.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(saved.role, role)
    assert.equal(saved.responderType, 'police')
  }
})

test('approved legacy police Officer without station may save unrelated profile changes', () => {
  let saved
  const render = harness({ account: { ...account, role: 'Officer' }, onSave: patch => { saved = patch } })
  find(render(), n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Updated' } })
  find(render(), n => n.props?.['aria-label'] === 'Account change reason').props.onChange({ target: { value: 'Name correction' } })
  const tree = render()
  assert.equal(find(tree, n => n.type === 'button' && n.props.children === 'Save account changes').props.disabled, false)
  find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(saved.name, 'Updated')
  assert.match(renderToStaticMarkup(tree), /Approved enforcer/)
  assert.match(renderToStaticMarkup(tree), /Active access/)
  assert.doesNotMatch(renderToStaticMarkup(tree), /Changing station sets/)
})

test('modal opens natively and restores prior focus even when ref is cleared on unmount', () => {
  let opened = 0, closed = 0, focused = 0
  const render = harness({}, { document: { activeElement: { focus() { focused++ } } } })
  render()
  render.refs[0].current = { showModal() { opened++ }, close() { closed++ } }
  const cleanup = render.effects[0]()
  assert.equal(opened, 1)
  render.refs[0].current = null
  cleanup()
  assert.equal(closed, 1)
  assert.equal(focused, 1)
})
test('stale reload is explicit and ordinary errors do not enable unintended approval', () => {
  let reloaded = 0
  const render = harness({ stale: true, error: 'Version changed', onReload: () => reloaded++ })
  find(render(), n => n.type === 'button' && n.props.children === 'Reload account').props.onClick()
  assert.equal(reloaded, 1)
})
test('station directory errors retain the current station and offer retry', async () => {
  const render = harness({ account: { ...account, role: 'Officer', station: { id: 'old', name: 'Legacy station', address: 'Main Street' } }, loadStations: async () => { throw new Error('Directory unavailable') } })
  render()
  render.effects[1]()
  await new Promise(resolve => setImmediate(resolve))
  const tree = render()
  const html = renderToStaticMarkup(tree)
  assert.match(html, /Directory unavailable/)
  assert.match(html, /Legacy station — Main Street/)
  assert.ok(find(tree, n => n.type === 'button' && n.props.children === 'Retry station directory'))
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Account station').props.value, 'old')
})

function viewHarness(loadAccounts) {
  let states = [], cursor = 0, effects = []
  const hooks = { ...React, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] }, useRef(initial) { const i = cursor++; return states[i] ??= { current: initial } }, useCallback: callback => callback, useEffect(effect) { effects.push(effect) } }
  const module = { exports: {} }
  const Editor = () => null
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/components/AccountsView.jsx', import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, { module, exports: module.exports, require: name => name === 'react' ? hooks : name === '../backend/accounts.js' ? { loadAccounts, loadAccountStations: async () => [], saveAccount: async () => {} } : name === './AccountEditor.jsx' ? { __esModule: true, default: Editor } : require(name) })
  const render = () => { cursor = 0; effects = []; const tree = module.exports.default({ client: {} }); render.effects = effects; return tree }
  render.Editor = Editor
  return render
}
test('explicit reload replaces station draft even when account version is unchanged', async () => {
  let calls = 0
  const initial = { ...account, role: 'Officer', station: { id: 'old', name: 'Old' } }
  const fresh = { ...initial, station: { id: 'new', name: 'New' } }
  const render = viewHarness(async () => ({ data: [calls++ ? fresh : initial], total: 1 }))
  render(); render.effects[0]()
  await new Promise(resolve => setImmediate(resolve))
  const trigger = { focus() {} }
  find(render(), n => typeof n.props?.onEdit === 'function').props.onEdit(initial, trigger)
  const before = find(render(), n => n.type === render.Editor)
  await before.props.onReload()
  const after = find(render(), n => n.type === render.Editor)
  assert.equal(after.props.account.station.id, 'new')
  assert.equal(after.props.account.version, before.props.account.version)
  assert.notEqual(after.key, before.key)
  assert.equal(after.props.returnFocusRef.current, trigger)
})

test('reload remount restores the original list trigger rather than a detached dialog field', () => {
  let triggerFocused = 0, fieldFocused = 0
  const render = harness({ returnFocusRef: { current: { focus() { triggerFocused++ } } } }, { document: { activeElement: { focus() { fieldFocused++ } } } })
  render()
  render.refs[0].current = { showModal() {}, close() {} }
  render.effects[0]()()
  assert.equal(triggerFocused, 1)
  assert.equal(fieldFocused, 0)
})

test('dirty close reveals confirmation and focuses Keep editing, then restores the prior field', () => {
  let focused = 0, restored = 0, scrolled = 0
  const render = harness({}, { document: { activeElement: { focus() { restored++ } } } })
  find(render(), n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Changed' } })
  find(render(), n => n.type === 'button' && n.props.children === 'Cancel').props.onClick()
  const tree = render()
  const panel = find(tree, n => n.props?.role === 'alert' && find(n, child => child.type === 'button' && child.props.children === 'Keep editing'))
  panel.ref.current = { scrollIntoView() { scrolled++ } }
  find(tree, n => n.type === 'button' && n.props.children === 'Keep editing').ref.current = { focus() { focused++ } }
  for (const effect of render.effects.slice(2)) effect()
  assert.equal(scrolled, 1)
  assert.equal(focused, 1)
  find(tree, n => n.type === 'button' && n.props.children === 'Keep editing').props.onClick()
  assert.equal(restored, 1)
})
test('save error scrolls into view and receives focus while retaining draft', () => {
  let scrolled = 0, focused = 0
  const render = harness({ error: 'Transfer blocked by active cases' })
  find(render(), n => n.props?.['aria-label'] === 'Account name').props.onChange({ target: { value: 'Retained name' } })
  const tree = render()
  const alert = find(tree, n => n.props?.role === 'alert')
  assert.equal(alert.props.tabIndex, -1)
  alert.ref.current = { scrollIntoView() { scrolled++ }, focus() { focused++ } }
  for (const effect of render.effects.slice(2)) effect()
  assert.equal(scrolled, 1)
  assert.equal(focused, 1)
  assert.equal(find(tree, n => n.props?.['aria-label'] === 'Account name').props.value, 'Retained name')
})
