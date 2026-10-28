import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseAccounts, loadAccounts, saveAccount, loadAccountStations } from '../src/backend/accounts.js'
import { canUseManager, officerCases, officerStatuses } from '../src/models/staffAccess.js'
import { reportsResponse } from '../src/data/reports.js'
import { parseReportsResponse } from '../src/models/report.js'

const account = { id: 'officer-id', name: '<Officer>', unit: 'Unit 1', responderType: 'police', role: 'Officer', enabled: true, version: 3, username: 'officer_name' }
const fixture = () => ({ ...structuredClone(reportsResponse.data[0]), status: 'Submitted', assignedOfficerId: null, verification: { verifiedAt: null, verifiedBy: null }, isDuplicate: false })

test('account identity shows name, username and compact user ID without labels', () => {
  const { AccountsTable } = component('../src/components/AccountsView.jsx')
  const id = '64e54f13-24d0-4041-a7ef-e9788145f69b'
  const html = renderToStaticMarkup(React.createElement(AccountsTable, { accounts: [{ ...account, id }] }))
  assert.match(html, /&lt;Officer&gt;<\/p>[\s\S]*officer_name<\/p>[\s\S]*#64e54f13<\/p>/)
  assert.doesNotMatch(html, /Full name|Username|User ID/)
  assert.ok(html.includes(`title="${id}">#64e54f13</p>`))
  assert.ok(!html.includes(`>${id}<`))
})
test('account groups separate public users, enforcers and administrators including pending applicants', () => {
  const { AccountGroups } = component('../src/components/AccountsView.jsx')
  const accounts = [
    { ...account, id: 'public', name: 'Public user', role: 'Public' },
    { ...account, id: 'officer', name: 'Approved enforcer', enabled: false },
    { ...account, id: 'applicant', name: 'Pending enforcer', role: 'Public', requestedAccountType: 'Officer' },
    { ...account, id: 'admin', name: 'Administrator', role: 'Admin', requestedAccountType: 'Officer' },
  ]
  const html = renderToStaticMarkup(React.createElement(AccountGroups, { accounts }))
  const users = html.match(/<section[^>]*aria-label="Users accounts"[\s\S]*?<\/section>/)[0]
  const enforcers = html.match(/<section[^>]*aria-label="Enforcers accounts"[\s\S]*?<\/section>/)[0]
  const admins = html.match(/<section[^>]*aria-label="Administrators accounts"[\s\S]*?<\/section>/)[0]
  assert.match(users, /Public user/)
  assert.doesNotMatch(users, /Approved enforcer|Pending enforcer|Administrator/)
  assert.match(enforcers, /Approved enforcer/)
  assert.match(enforcers, /Pending enforcer/)
  assert.match(enforcers, /Awaiting verification/)
  assert.match(enforcers, /Suspended/)
  assert.doesNotMatch(enforcers, /Administrator|· public</)
  assert.match(admins, /Administrator/)
  assert.doesNotMatch(users, /Station affiliation/)
  assert.doesNotMatch(admins, /Station affiliation/)
  assert.match(enforcers, /Station affiliation/)
  assert.equal((html.match(/Edit account/g) ?? []).length, 3)
  assert.match(html, /Review application/)
  const empty = renderToStaticMarkup(React.createElement(AccountGroups, { accounts: [] }))
  assert.match(empty, /No users on this page/)
  assert.match(empty, /No enforcers on this page/)
})

test('Admin sees pending enforcer applications and verification instructions', () => {
  const { AccountsTable, AccountEditor } = component('../src/components/AccountsView.jsx', name => name === '../backend/accounts.js' ? { loadAccounts, saveAccount } : undefined)
  const applicant = { ...account, role: 'Public', requestedAccountType: 'Officer' }
  assert.match(renderToStaticMarkup(React.createElement(AccountsTable, { accounts: [applicant] })), /Awaiting verification/)
  assert.match(renderToStaticMarkup(React.createElement(AccountEditor, { account: applicant })), /Verify their identity and credentials/)
})
function component(path, extraRequire, globals = {}) {
  const url = new URL(path, import.meta.url), module = { exports: {} }, require = createRequire(fileURLToPath(url))
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
    { module, exports: module.exports, require: name => extraRequire?.(name) ?? (name === './AccountEditor.jsx' ? { default: component('../src/components/AccountEditor.jsx').default, __esModule: true } : require(name)), ...globals })
  return module.exports
}
test('only enabled Admin and Officer accounts pass the staff gate', () => {
  for (const role of ['Public','Officer','Admin','SuperAdmin']) for (const enabled of [true,false]) {
    assert.equal(canUseManager({ role, enabled }), enabled && ['Officer','Admin'].includes(role))
  }
  assert.equal(canUseManager(null), false)
})
test('account responses reject missing access/version, malformed profiles and duplicate identities', () => {
  assert.equal(parseAccounts({ data: [account], total: 1 }).data[0], account)
  for (const bad of [{ ...account, enabled: undefined }, { ...account, version: 0 }, { ...account, responderType: 'other' }, { ...account, role: 'Owner' }, { ...account, name: '' }]) assert.throws(() => parseAccounts({ data: [bad], total: 1 }))
  assert.throws(() => parseAccounts({ data: [account,account], total: 2 }))
})
test('account RPCs send bounded pagination, expected version and reason; denied/stale writes propagate', async () => {
  await loadAccounts({ rpc: async (name,args) => {
    assert.equal(name, 'list_accounts'); assert.deepEqual(args, { p_search: 'Unit', p_offset: 50, p_limit: 50 })
    return { data: { data: [account], total: 51 } }
  } }, ' Unit ', 50)
  const patch = { ...account, name: ' New name ', enabled: false }
  const saved = await saveAccount({ rpc: async (name,args) => {
    assert.equal(name, 'manage_account')
    assert.deepEqual(args, { p_id: account.id, p_name: 'New name', p_station_id: null, p_expected_station_id: null, p_verify: false, p_responder_type: 'police', p_role: 'Officer', p_enabled: false, p_version: 3, p_reason: 'Suspend' })
    return { data: { ...patch, name: 'New name', version: 4 } }
  } }, account, patch, ' Suspend ')
  assert.equal(saved.version, 4)
  for (const message of ['Administrator account required.','This account changed. Refresh it before saving.']) await assert.rejects(saveAccount({ rpc: async () => ({ error: new Error(message) }) }, account, patch, 'Reason'), { message })
})
test('historical reporter and verifier references survive current-role changes', () => {
  const response = structuredClone(reportsResponse)
  const author = response.data.find(report => report.reporter.userId)?.reporter.userId
  const reporter = response.included.users.find(user => user.id === author)
  reporter.role = 'Admin'
  const verifierId = response.data.find(report => report.verification.verifiedBy)?.verification.verifiedBy
  const verifier = response.included.users.find(user => user.id === verifierId)
  verifier.role = 'Public'
  assert.equal(parseReportsResponse(response), response)
  response.data[0].reporter.userId = 'missing-reference'
  assert.throws(() => parseReportsResponse(response), /Unknown reporter/)
})
test('Officer queues and transitions exclude other assignments, self-verification, duplicates and closed cases', () => {
  const queue = { ...fixture(), id: 'queue' }, own = { ...fixture(), id: 'own', assignedOfficerId: account.id, status: 'Assigned' }
  const reports = [queue,own,{ ...own,id:'other',assignedOfficerId:'other-id' },{ ...queue,id:'duplicate',isDuplicate:true },{ ...queue,id:'self',reporter:{ ...queue.reporter,userId:account.id } },{ ...queue,id:'closed',status:'Resolved / Closed' }]
  assert.deepEqual(officerCases(reports, account.id).verification.map(r => r.id), ['queue'])
  assert.deepEqual(officerCases(reports, account.id).assignments.map(r => r.id), ['own'])
  assert.deepEqual(officerStatuses(queue,account.id), ['Verified'])
  assert.deepEqual(officerStatuses(own,account.id), ['Assigned','In Progress'])
  assert.deepEqual(officerStatuses({ ...own,status:'In Progress' },account.id), ['In Progress','Resolved / Closed'])
  assert.deepEqual(officerStatuses({ ...own,assignedOfficerId:'other-id' },account.id), [])
})
const { default: Modal } = component('../src/components/ReportModal.jsx')
const { AccountsTable, AccountEditor } = component('../src/components/AccountsView.jsx')
const { default: Workspace } = component('../src/components/OfficerWorkspace.jsx')
test('actual Officer review modal offers verification without Admin-only controls', () => {
  const report = { ...fixture(), events: [{ id: 1, type:'submitted', status:'Submitted', createdAt:'2026-10-19T00:00:00Z', actor:null }] }
  const html = renderToStaticMarkup(React.createElement(Modal, { report, users: [], actorRole:'Officer', viewerId:account.id, live:true }))
  assert.match(html, /Verify report/)
  assert.match(html, /Verification decision/)
  assert.match(html, /Not included in Officer view/)
  for (const text of ['Assign officer','Duplicate review','Incident fact corrections','value="Rejected"']) assert.ok(!html.includes(text),text)
})
test('account editor disables own role/access, keeps required reasons, and table escapes profile text', () => {
  const html = renderToStaticMarkup(React.createElement(AccountEditor, { account: { ...account,role:'Admin' },currentUserId:account.id }))
  assert.match(html, /aria-label="Account role" readonly=""/)
  assert.match(html, /aria-label="Account active"[^>]*disabled=""/)
  assert.match(html, /aria-label="Account change reason" required=""/)
  assert.ok(!html.includes('type="password"'))
  assert.match(renderToStaticMarkup(React.createElement(AccountsTable,{ accounts:[account] })), /&lt;Officer&gt;/)
})
test('Officer workspace renders shared queue and assignment navigation without administrative routes', () => {
  const html = renderToStaticMarkup(React.createElement(Workspace,{ reports:[fixture()],currentUser:account }))
  assert.match(html,/Awaiting verification/)
  assert.match(html,/My assignments/)
  assert.match(html,/Review and verify/)
  assert.ok(!html.includes('Account Management'))
  assert.ok(!html.includes('Demo reports'))
})

test('actual staff gate rechecks suspension and demotion on retained sessions', async () => {
  const states = [], effects = [], timers = []
  let index = 0, role = { role:'Admin',enabled:true,version:1 }, authChanged, finishCheck
  const session = { user:{ id:'staff-id' } }
  const hooks = {
    useState: initial => { const slot=index++; if (!(slot in states)) states[slot]=initial; return [states[slot],value => { states[slot]=value }] },
    useEffect: callback => { effects.push(callback) },
  }
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => {
      if (finishCheck) await new Promise(resolve => { finishCheck = resolve })
      return { data:role,error:null }
    } }) }) }),
    auth: { getSession:async () => ({ data:{ session } }), onAuthStateChange:callback => { authChanged = callback; return { data:{ subscription:{ unsubscribe() {} } } } } },
  }
  const { default: Gate } = component('../src/backend/ManagerAuth.jsx',name => name === 'react' ? hooks : name === './client.js' ? { backend:client } : name === '../components/AuthLanding.jsx' ? component('../src/components/AuthLanding.jsx') : undefined,
    { setInterval: callback => { timers.push(callback); return 1 },clearInterval() {},setTimeout })
  const render = () => { index=0; return Gate({ children:user => ({ admitted:user.appRole }) }) }
  render(); const cleanup=effects[0](); await new Promise(resolve => setTimeout(resolve,0))
  assert.equal(render().admitted,'Admin')
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED']) {
    finishCheck = true
    authChanged(event, session)
    await new Promise(resolve => setTimeout(resolve,0))
    assert.equal(render().admitted,'Admin', `${event} keeps dashboard mounted while access is checked`)
    finishCheck(); finishCheck = null
    await new Promise(resolve => setTimeout(resolve,0))
    assert.equal(render().admitted,'Admin')
  }
  role={ role:'Officer',enabled:true,version:2 }; timers[0](); await new Promise(resolve => setTimeout(resolve,0))
  assert.equal(render().admitted,'Officer')
  role={ role:'Officer',enabled:false,version:3 }; timers[0](); await new Promise(resolve => setTimeout(resolve,0))
  assert.match(renderToStaticMarkup(render()),/suspended/)
  role={ role:'Public',enabled:true,version:4 }; timers[0](); await new Promise(resolve => setTimeout(resolve,0))
  assert.match(renderToStaticMarkup(render()),/does not have active staff access/)
  states[5] = 'previous_staff'
  states[6] = 'previous_password'
  authChanged('SIGNED_OUT', null)
  await new Promise(resolve => setTimeout(resolve,0))
  assert.match(renderToStaticMarkup(render()),/Sign in to review reports/)
  assert.equal(states[5], '', 'sign-out clears username/email')
  assert.equal(states[6], '', 'sign-out clears password')
  states[5] = 'new_login_draft'
  authChanged('INITIAL_SESSION', null)
  await new Promise(resolve => setTimeout(resolve,0))
  assert.equal(states[5], 'new_login_draft', 'an empty initial session must not erase typing')
  cleanup()
})

test('account station and approval payload preserves source station and never writes Unit', async () => {
  const original = { ...account, role: 'Public', requestedAccountType: 'Officer', station: { id: 'node/1', name: 'Original', address: 'Road' } }
  const patch = { name: 'Applicant', role: 'Officer', responderType: 'police', enabled: true, stationId: 'node/2', verify: true }
  let args
  await saveAccount({ rpc: async (_, params) => { args = params; return { data: { ...account, name: patch.name, station: { id: 'node/2', name: 'New', address: '' } } } } }, original, patch, 'Checked credentials')
  assert.equal(args.p_station_id, 'node/2')
  assert.equal(args.p_expected_station_id, 'node/1')
  assert.equal(args.p_verify, true)
  assert.equal(Object.hasOwn(args, 'p_unit'), false)
  for (const station of [{ id: '', name: 'Station', address: '' }, { id: 'node/1', name: 2, address: '' }, 'node/1']) assert.throws(() => parseAccounts({ data: [{ ...account, station }], total: 1 }))
})

test('station directory exposes names and addresses and fails explicitly', async () => {
  const rows = [{ id: 'node/1', name: 'Police Station', address: 'Malolos' }]
  assert.deepEqual(await loadAccountStations({ rpc: async name => { assert.equal(name, 'get_login_stations'); return { data: rows } } }), rows)
  await assert.rejects(loadAccountStations({ rpc: async () => ({ error: new Error('Directory unavailable') }) }), /Directory unavailable/)
  await assert.rejects(loadAccountStations({ rpc: async () => ({ data: [{}] }) }), /Invalid station/)
})

test('account tabs show one group and support keyboard switching', () => {
  let active = 0
  const { AccountGroups } = component('../src/components/AccountsView.jsx', name => name === 'react' ? { ...React, useState: () => [active, next => { active = next }] } : undefined)
  const render = () => AccountGroups({ accounts: [account], disabled: false })
  function all(node, role) {
    if (!React.isValidElement(node)) return []
    return [...(node.props.role === role ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => all(child, role))]
  }
  let tree = render(), tabs = all(tree, 'tab'), panels = all(tree, 'tabpanel')
  assert.equal(tabs.length, 3)
  assert.equal(panels.filter(panel => !panel.props.hidden).length, 1)
  assert.equal(tabs[0].props['aria-selected'], true)
  tabs[1].props.onClick()
  tree = render(); tabs = all(tree, 'tab'); panels = all(tree, 'tabpanel')
  assert.equal(tabs[1].props['aria-selected'], true)
  assert.equal(panels[1].props.hidden, false)
  assert.equal(panels[0].props.hidden, true)
  let focused = -1
  tabs[1].props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, currentTarget: { parentElement: { querySelectorAll: () => [0,1,2].map(index => ({ focus() { focused = index } })) } } })
  assert.equal(active, 2)
  assert.equal(focused, 2)
})
