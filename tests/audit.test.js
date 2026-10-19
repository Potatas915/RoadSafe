import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const url = new URL('../src/components/ReportModal.jsx', import.meta.url)
const module = { exports: {} }
vm.runInNewContext(transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code,
  { module, exports: module.exports, require: createRequire(fileURLToPath(url)) })
const History = module.exports.ReportHistory
const event = { id: 1, type: 'review_updated', fromStatus: 'Submitted', status: 'Under Review', createdAt: '2026-10-19T04:00:00Z', message: 'Checked evidence' }

test('report history displays actor identity, time, transition and message without interpreting HTML', () => {
  const html = renderToStaticMarkup(React.createElement(History, { events: [{ ...event, actor: { id: 'staff-id', name: '<Admin>' } }] }))
  for (const value of ['&lt;Admin&gt;', 'staff-id', 'Submitted', 'Under Review', 'Checked evidence', '2026']) assert.ok(html.includes(value), value)
  assert.ok(!html.includes('<Admin>'))
})
test('legacy history explicitly identifies missing attribution and retains duplicate reference behavior', () => {
  const html = renderToStaticMarkup(React.createElement(History, { events: [{ ...event, type: 'duplicate_marked', relatedReportId: 'original-id' }] }))
  assert.match(html, /Unavailable \(historical or demo event\)/)
  assert.match(html, /Marked as duplicate/)
  assert.match(html, /original-id/)
  assert.equal(renderToStaticMarkup(React.createElement(History)), '')
})
