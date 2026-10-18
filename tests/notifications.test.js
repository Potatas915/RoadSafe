import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { reportNotifications, notificationStorageKey, loadReadNotifications } from '../src/models/notifications.js'

const submittedAt = '2026-10-18T00:00:00Z'
const report = { id: 'report-1', submittedAt, events: [
  { id: 1, type: 'submitted', status: 'Submitted', createdAt: submittedAt },
  { id: 2, type: 'evidence_added', status: null, createdAt: submittedAt },
  { id: 3, type: 'review_updated', status: 'Under Review', createdAt: '2026-10-18T00:01:00Z' },
  { id: 4, type: 'review_updated', status: 'Under Review', createdAt: '2026-10-18T00:02:00Z' },
  { id: 5, type: 'review_updated', status: 'Verified', createdAt: '2026-10-18T00:03:00Z' },
] }

test('one confirmation per report and genuine status transitions, including offline history', () => {
  const items = reportNotifications([report])
  assert.equal(items.length, 3)
  assert.match(items[0].message, /Under Review → Verified/)
  assert.match(items[1].message, /Submitted → Under Review/)
  assert.equal(items[2].title, 'Submission confirmed')
  assert.equal(items[2].reportId, report.id)
  assert.deepEqual(reportNotifications(structuredClone([report])), items, 'polling must preserve IDs and ordering')
  assert.equal(report.events[0].id, 1, 'input history is not mutated')
  assert.deepEqual(reportNotifications([]), [])
})
test('equal-time events use numeric IDs and changed assignments/remarks do not imply status changes', () => {
  const events = [
    { id: 10, status: 'Verified', createdAt: submittedAt },
    { id: 9, status: 'Under Review', createdAt: submittedAt },
    { id: 11, status: 'Verified', createdAt: submittedAt },
  ]
  const items = reportNotifications([{ ...report, events }])
  assert.equal(items.length, 3)
  assert.ok(items.some((item) => item.message.includes('Under Review → Verified')))
})
test('legacy/demo reports get confirmations and demo saves retain their actual previous status', () => {
  assert.equal(reportNotifications([{ id: 'demo', submittedAt }]).length, 1)
  const items = reportNotifications([{ id: 'demo', submittedAt, events: [{ id: 'save', fromStatus: 'Under Review', status: 'Verified', createdAt: submittedAt }] }])
  assert.ok(items.some((item) => item.message.includes('Under Review → Verified')))
})
test('read IDs persist per account, malformed or unavailable browser storage is harmless', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) }
  const firstKey = notificationStorageKey('admin-one')
  values.set(firstKey, JSON.stringify(['submission:report-1', 42]))
  assert.deepEqual(loadReadNotifications(storage, firstKey), ['submission:report-1'])
  assert.deepEqual(loadReadNotifications(storage, notificationStorageKey('admin-two')), [])
  for (const bad of ['null', '{}', 'broken']) { values.set(firstKey, bad); assert.deepEqual(loadReadNotifications(storage, firstKey), []) }
  assert.deepEqual(loadReadNotifications({ getItem() { throw new Error('Denied') } }, firstKey), [])
})

const url = new URL('../src/components/NotificationBell.jsx', import.meta.url)
const filename = fileURLToPath(url)
const code = transformSync(readFileSync(url, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code
const module = { exports: {} }
const nativeRequire = createRequire(filename)
vm.runInNewContext(code, { module, exports: module.exports, require: (name) => name === '../models/report.js' ? { formatDateTime: (value) => value } : nativeRequire(name) }, { filename })
const { default: NotificationBell, NotificationList } = module.exports

test('bell announces unread notifications; list exposes timestamps, read controls and empty state', () => {
  const items = reportNotifications([report]).map((item, index) => ({ ...item, read: index !== 0 }))
  const bell = renderToStaticMarkup(React.createElement(NotificationBell, { notifications: items, unreadCount: 1 }))
  assert.match(bell, /Notifications, 1 unread/)
  assert.match(bell, /aria-expanded="false"/)
  const list = renderToStaticMarkup(React.createElement(NotificationList, { notifications: items }))
  assert.match(list, /Report status changed/)
  assert.match(list, /datetime="2026-10-18T00:03:00Z"/i)
  assert.equal((list.match(/Mark as read/g) ?? []).length, 1)
  assert.match(renderToStaticMarkup(React.createElement(NotificationList, { notifications: [] })), /No notifications yet/)
})
