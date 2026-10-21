import test from 'node:test'
import assert from 'node:assert/strict'
import { REPORT_QUEUES, sortReportQueue } from '../src/models/reportQueue.js'
import { reportsResponse } from '../src/data/reports.js'

test('management queues distinguish review, clarification, assignments and retained duplicates', () => {
  const matches = (id, report) => REPORT_QUEUES.find(q => q[0] === id)[2](report)
  assert.equal(matches('review', { status: 'Submitted' }), true)
  assert.equal(matches('review', { status: 'Additional Information Required' }), false)
  assert.equal(matches('information', { status: 'Additional Information Required' }), true)
  assert.equal(matches('unassigned', { status: 'Verified', assignedOfficerId: 'officer' }), false)
  assert.equal(matches('unassigned', { status: 'Verified', assignedOfficerId: null }), true)
  assert.equal(matches('active', { status: 'In Progress' }), true)
  assert.equal(matches('rejected', { status: 'Rejected', isDuplicate: true }), true)
})

test('management sorting uses submission and history dates without mutating reports', () => {
  const a = { ...reportsResponse.data[0], id: 'a', submittedAt: '2026-10-01T00:00:00Z', events: [{ createdAt: '2026-10-22T00:00:00Z' }] }
  const b = { ...a, id: 'b', submittedAt: '2026-10-02T00:00:00Z', events: [] }
  const reports = [a, b]
  assert.equal(sortReportQueue(reports, 'oldest')[0].id, 'a')
  assert.equal(sortReportQueue(reports, 'newest')[0].id, 'b')
  assert.equal(sortReportQueue(reports, 'updated')[0].id, 'a')
  assert.deepEqual(reports.map(r => r.id), ['a', 'b'])
})
