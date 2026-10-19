import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ACCIDENT_CATEGORIES, categoryLabel, validateReport } from '../src/models/report.js'
import { reportsResponse } from '../src/data/reports.js'
import { parseCategories, loadCategories, saveCategory } from '../src/backend/categories.js'
import { CategoryContext } from '../src/components/CategoryContext.js'
import { createCsv, exportRows } from '../src/services/reportExport.js'

const catalog = () => ACCIDENT_CATEGORIES.map(row => ({ ...row, version: 1, enabled: true }))
function component(relative) {
  const url = new URL(relative, import.meta.url), filename = fileURLToPath(url)
  const code = transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: createRequire(filename) }, { filename })
  return module.exports.default
}
test('catalog preserves fixed IDs/colors and rejects incomplete or malformed metadata', async () => {
  const rows = catalog().reverse()
  assert.deepEqual(parseCategories(rows).map(row => row.id), ACCIDENT_CATEGORIES.map(row => row.id))
  assert.throws(() => parseCategories(rows.slice(1)), /incomplete/)
  assert.throws(() => parseCategories(rows.map(row => ({ ...row, label: '' }))), /Invalid/)
  assert.throws(() => parseCategories(rows.map(row => ({ ...row, enabled: 'false' }))), /Invalid/)
  assert.throws(() => parseCategories(rows.map(row => ({ ...row, version: 0 }))), /Invalid/)
  assert.throws(() => parseCategories(rows.map(row => ({ ...row, id: 'collision' }))), /Invalid/)
  const error = new Error('Catalog unavailable')
  await assert.rejects(loadCategories({ from: () => ({ select: async () => ({ error }) }) }), error)
})
test('Admin saves carry category version; conflicts and permission denials are propagated', async () => {
  const category = catalog()[0], patch = { label: 'Road collision', enabled: false }
  let args
  const result = await saveCategory({ rpc: async (name, params) => {
    assert.equal(name, 'update_accident_category'); args = params
    return { data: { ...category, ...patch, version: 2 } }
  } }, category, patch)
  assert.deepEqual(args, { p_id: 'collision', p_label: 'Road collision', p_enabled: false, p_version: 1 })
  assert.equal(result.version, 2)
  for (const message of ['Administrator account required.', 'Category changed. Refresh before saving.']) {
    await assert.rejects(saveCategory({ rpc: async () => ({ error: new Error(message) }) }, category, patch), { message })
  }
})
test('renamed disabled categories retain historical reports, filters, details, and CSV records', () => {
  const categories = catalog()
  categories[0] = { ...categories[0], label: 'Road collision', enabled: false, version: 2 }
  const report = reportsResponse.data.find(row => row.categoryId === 'collision')
  assert.deepEqual(validateReport(report), [])
  assert.equal(categoryLabel(report.categoryId, categories), 'Road collision')
  assert.equal(exportRows([report], [], categories)[0][3], 'Road collision')
  assert.match(createCsv([report], [], categories), /Road collision/)
  for (const name of ['ReportsView', 'ReportModal', 'MapReportCard']) {
    const Component = component(`../src/components/${name}.jsx`)
    const html = renderToStaticMarkup(React.createElement(CategoryContext.Provider, { value: categories },
      React.createElement(Component, { reports: [report], report, users: reportsResponse.included.users, onOpenReport() {}, onSave() {}, onClose() {} })))
    assert.match(html, /Road collision/)
  }
})
test('settings shows fixed IDs and disables shared edits without Admin live mode', () => {
  const SettingsView = component('../src/components/SettingsView.jsx')
  const html = renderToStaticMarkup(React.createElement(SettingsView, { categories: catalog(), live: false }))
  assert.match(html, /Stable ID: collision/)
  assert.match(html, /sign in as an Administrator/)
  assert.equal((html.match(/disabled=""/g) ?? []).length, 6)
  assert.match(html, /historical reports/)
})
