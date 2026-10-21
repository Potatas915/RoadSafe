import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'

test('report review does not reopen a dashboard summary after sidebar navigation', () => {
  const values = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const slot = cursor++
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial
      return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
    },
    useEffect() {}, useCallback: fn => fn,
  }
  const url = new URL('../src/App.jsx', import.meta.url)
  const require = createRequire(url)
  const module = { exports: {} }
  vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code, {
    module, exports: module.exports, structuredClone,
    require(name) {
      if (name === 'react') return hooks
      if (name.endsWith('.css')) return {}
      if (name === './backend/client.js') return { backend: null }
      if (name === './hooks/useNotifications.js') return { __esModule: true, default: () => ({ notifications: [], unreadCount: 0 }) }
      if (name === './components/CategoryContext.js') return { CategoryContext: { Provider: 'Provider' } }
      if (name.startsWith('./components/') || name === './backend/ManagerAuth.jsx') return { __esModule: true, default: name.split('/').pop().replace('.jsx', '') }
      return require(name)
    },
  })
  const dashboard = module.exports.default().type
  const render = () => { cursor = 0; return dashboard({}) }
  function find(node, type) {
    if (!React.isValidElement(node)) return null
    if (node.type === type) return node
    for (const child of React.Children.toArray(node.props.children)) {
      const match = find(child, type)
      if (match) return match
    }
    return null
  }
  let tree = render()
  find(tree, 'Sidebar').props.onChange('reports-view')
  tree = render()
  const id = find(tree, 'ReportsView').props.reports[0].id
  find(tree, 'ReportsView').props.onOpenReport(id)
  tree = render()
  assert.ok(find(tree, 'ReportsView').props.detailPanel)
  assert.equal(find(tree, 'DashboardReportSummary'), null)
  find(tree, 'Sidebar').props.onChange('dashboard-view')
  tree = render()
  assert.equal(find(tree, 'DashboardReportSummary'), null)
  find(tree, 'DashboardView').props.onOpenReport(id)
  tree = render()
  assert.ok(find(tree, 'DashboardReportSummary'))
  find(tree, 'DashboardReportSummary').props.onManage()
  tree = render()
  assert.equal(find(tree, 'ReportsView').props.selectedReportId, id)
  assert.ok(find(tree, 'ReportsView').props.detailPanel)
  assert.equal(find(tree, 'DashboardReportSummary'), null)
})

