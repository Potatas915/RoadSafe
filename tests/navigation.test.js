import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'

test('all operational views share one backend report feed and newly loaded reports join it', async () => {
  const { reportsResponse } = await import('../src/data/reports.js')
  const feed = structuredClone(reportsResponse)
  const values = []
  let cursor = 0
  const client = {}
  const saves = []
  const hooks = {
    useState(initial) {
      const slot = cursor++
      if (!(slot in values)) {
        const value = typeof initial === 'function' ? initial() : initial
        values[slot] = value?.meta?.schemaVersion && Array.isArray(value.data) ? structuredClone(feed) : value
      }
      return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
    }, useEffect() {}, useCallback: fn => fn,
  }
  const url = new URL('../src/App.jsx', import.meta.url), require = createRequire(url), module = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports, require(name) {
      if (name === 'react') return hooks
      if (name.endsWith('.css')) return {}
      if (name === './backend/client.js') return { backend: client }
      if (name === './backend/reports.js') return { loadReportFeed: async () => structuredClone(feed), saveReportReview: async (...args) => saves.push(args) }
      if (name === './hooks/useNotifications.js') return { __esModule: true, default: () => ({ notifications: [], unreadCount: 0 }) }
      if (name === './components/CategoryContext.js') return { CategoryContext: { Provider: 'Provider' } }
      if (name.startsWith('./components/') || name === './backend/ManagerAuth.jsx') return { __esModule: true, default: name.split('/').pop().replace('.jsx', '') }
      return require(name)
    },
  })
  const admin = feed.included.users.find(user => user.role === 'Admin')
  const signedInUser = { id: admin.id, appRole: 'Admin' }
  const dashboard = module.exports.default().props.children(signedInUser).type
  const render = () => { cursor = 0; return dashboard({ signedInUser }) }
  function find(node, type) {
    if (!React.isValidElement(node)) return null
    if (node.type === type) return node
    for (const child of React.Children.toArray(node.props.children)) { const match = find(child, type); if (match) return match }
    return null
  }
  let tree = render()
  const reports = find(tree, 'MapView').props.reportRecords
  assert.equal(find(tree, 'MapView').props.enforcerClient, client)
  assert.equal(find(tree, 'select'), null)
  assert.equal(find(tree, 'MapView').props.onDemoSave, undefined)
  for (const [view, component] of [['reports-view', 'ReportsView'], ['dashboard-view', 'DashboardView'], ['officers-view', 'OfficersView'], ['analytics-view', 'AnalyticsView']]) {
    find(tree, 'Sidebar').props.onChange(view)
    tree = render()
    assert.strictEqual(find(tree, component).props.reports, reports)
  }
  find(tree, 'Sidebar').props.onChange('reports-view')
  tree = render()
  find(tree, 'ReportsView').props.onOpenReport(reports[0].id)
  tree = render()
  const modal = find(tree, 'ReportsView').props.detailPanel
  assert.equal(modal.props.live, true)
  feed.data.push({ ...feed.data[0], id: 'new-submission' })
  await modal.props.onSave(reports[0].id, { status: reports[0].status })
  assert.equal(saves[0][0], client)
  tree = render()
  assert.ok(find(tree, 'ReportsView').props.reports.some(report => report.id === 'new-submission'))
  assert.strictEqual(find(tree, 'ReportsView').props.reports, find(tree, 'MapView').props.reportRecords)
  assert.doesNotMatch(readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'), /demoPreview|demoResponse|reportsResponse|Report source|VITE_REPORTS_API_URL/)
})
test('tactical map has no independent fictional incident source', () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /luzonReportsResponse|sampleMode|Map report source/)
})
