import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'

test('report review and Officer Dispatch preserve the selected demo/current source', async () => {
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
  const render = (props = {}) => { cursor = 0; return dashboard(props) }
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
  const managementReports = find(tree, 'ReportsView').props.reports
  const id = managementReports[0].id
  find(tree, 'Sidebar').props.onChange('map-view')
  tree = render()
  assert.strictEqual(find(tree, 'MapView').props.reportRecords, managementReports)
  assert.equal(find(tree, 'MapView').props.enforcerClient, null)
  find(tree, 'MapView').props.onOpenReport(id)
  tree = render()
  assert.equal(find(tree, 'ReportModal').props.report.id, id)
  const sourcePicker = find(tree, 'select')
  sourcePicker.props.onChange({ target: { value: 'current' } })
  tree = render()
  const currentReports = find(tree, 'MapView').props.reportRecords
  find(tree, 'Sidebar').props.onChange('reports-view')
  tree = render()
  assert.strictEqual(find(tree, 'ReportsView').props.reports, currentReports)
  find(tree, 'select').props.onChange({ target: { value: 'demo' } })
  tree = render()
  find(tree, 'ReportsView').props.onOpenReport(id)
  tree = render()
  assert.ok(find(tree, 'ReportsView').props.detailPanel)
  find(tree, 'ReportsView').props.detailPanel.props.onViewOnMap(managementReports[0])
  tree = render()
  assert.equal(find(tree, 'ReportsView'), null)
  assert.equal(find(tree, 'ReportModal'), null)
  assert.equal(find(tree, 'MapView').props.searchLocation.reportId, id)
  assert.deepEqual(Array.from(find(tree, 'MapView').props.searchLocation.coordinates), [managementReports[0].location.coordinates.longitude, managementReports[0].location.coordinates.latitude])
  assert.strictEqual(find(tree, 'MapView').props.reportRecords, managementReports)
  find(tree, 'Sidebar').props.onChange('reports-view')
  tree = render()
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
  find(tree, 'ReportsView').props.detailPanel.props.onViewOnMap(managementReports[0])
  tree = render()
  assert.equal(find(tree, 'ReportsView'), null)
  assert.equal(find(tree, 'ReportModal'), null)
  assert.equal(find(tree, 'MapView').props.searchLocation.reportId, id)
  assert.deepEqual(Array.from(find(tree, 'MapView').props.searchLocation.coordinates), [managementReports[0].location.coordinates.longitude, managementReports[0].location.coordinates.latitude])
  assert.strictEqual(find(tree, 'MapView').props.reportRecords, managementReports)
  find(tree, 'Sidebar').props.onChange('reports-view')
  tree = render()
  assert.equal(find(tree, 'DashboardReportSummary'), null)
  find(tree, 'Sidebar').props.onChange('officers-view')
  tree = render({ signedInUser: { id: 'admin-demo' } })
  assert.strictEqual(find(tree, 'OfficersView').props.reports, managementReports)
  assert.notStrictEqual(find(tree, 'OfficersView').props.users, find(tree, 'MapView').props.users)
  assert.equal(find(tree, 'select').props.value, 'demo')
  find(tree, 'OfficersView').props.onOpenReport(id)
  tree = render({ signedInUser: { id: 'admin-demo' } })
  const modal = find(tree, 'ReportModal')
  assert.equal(modal.props.live, false)
  assert.equal(modal.props.onCorrect, undefined)
  await modal.props.onSave(id, { status: modal.props.report.status, assignedOfficerId: modal.props.report.assignedOfficerId, officialRemarks: 'Demo dispatch review', rejectionReason: null })
  tree = render({ signedInUser: { id: 'admin-demo' } })
  assert.equal(find(tree, 'OfficersView').props.reports.find(report => report.id === id).officialRemarks, 'Demo dispatch review')
  find(tree, 'select').props.onChange({ target: { value: 'current' } })
  tree = render()
  assert.strictEqual(find(tree, 'OfficersView').props.reports, currentReports)
  find(tree, 'OfficersView').props.onOpenReport(id)
  tree = render({ signedInUser: { id: 'admin-demo' } })
  assert.equal(find(tree, 'ReportModal').props.live, true)
})


test('tactical map has no independent fictional incident source', () => {
  const source = readFileSync(new URL('../src/components/MapView.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /luzonReportsResponse|sampleMode|Map report source/)
})
