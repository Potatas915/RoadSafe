import test from 'node:test'
import assert from 'node:assert/strict'
import { reportsResponse } from '../src/data/reports.js'
import { applyDuplicateReview, duplicateOriginals } from '../src/models/reportDuplicates.js'
import { validateReport, updateReport } from '../src/models/report.js'
import { saveReportDuplicate } from '../src/backend/reports.js'

const actor = reportsResponse.included.users.find(user => user.role === 'Admin')
const records = () => structuredClone(reportsResponse.data)

test('duplicate preview retains source details, audits original/actor, and clears back to review', () => {
  const reports = records(), source = reports[0], original = reports[1]
  const marked = applyDuplicateReview(reports, source.id, original.id, ' Same incident ', actor, '2026-10-19T00:00:00Z')
  assert.equal(marked.status, 'Rejected')
  assert.equal(marked.duplicateOfReportId, original.id)
  assert.equal(marked.rejectionReason, 'Same incident')
  assert.deepEqual(marked.evidence, source.evidence)
  assert.equal(marked.description, source.description)
  assert.equal(marked.events.at(-1).actorId, actor.id)
  assert.equal(marked.events.at(-1).relatedReportId, original.id)
  assert.deepEqual(validateReport(marked), [])
  assert.equal(source.status, 'Under Review', 'Never mutate the original input')
  const cleared = applyDuplicateReview([marked, original], marked.id, null, null, actor)
  assert.equal(cleared.isDuplicate, false)
  assert.equal(cleared.duplicateOfReportId, null)
  assert.equal(cleared.status, 'Under Review')
  assert.equal(cleared.rejectionReason, null)
  assert.equal(cleared.events.at(-1).type, 'duplicate_cleared')
  assert.equal(cleared.events.at(-1).relatedReportId, original.id)
  assert.equal(cleared.version, marked.version + 1)
})

test('duplicate preview blocks self/missing/rejected originals, chains, active cases and untrusted actors', () => {
  const reports = records(), source = reports[0], original = reports[1]
  assert.throws(() => applyDuplicateReview(reports, source.id, source.id, 'Same', actor))
  assert.throws(() => applyDuplicateReview(reports, source.id, 'missing', 'Same', actor))
  assert.throws(() => applyDuplicateReview(reports, source.id, original.id, ' ', actor))
  assert.throws(() => applyDuplicateReview(reports, source.id, original.id, 'Same', { ...actor, role: 'Public' }))
  assert.throws(() => applyDuplicateReview(reports, original.id, source.id, 'Same', actor))
  const duplicate = applyDuplicateReview(reports, source.id, original.id, 'Same', actor)
  const chain = [duplicate, original, reports[2]]
  assert.throws(() => applyDuplicateReview(chain, reports[2].id, duplicate.id, 'Same', actor))
  assert.throws(() => applyDuplicateReview(chain, original.id, reports[2].id, 'Same', actor))
  assert.ok(!duplicateOriginals(chain, reports[2].id).some(r => r.id === duplicate.id))
  assert.throws(() => updateReport(duplicate, { status: 'Under Review' }, actor.id), /Clear the duplicate flag/)
})

test('duplicate validation accepts reporter-redacted links and rejects inconsistent flags/references', () => {
  const source = records()[0]
  assert.deepEqual(validateReport({ ...source, status: 'Rejected', rejectionReason: 'Duplicate', isDuplicate: true, duplicateOfReportId: null }), [])
  assert.ok(validateReport({ ...source, isDuplicate: true }).length)
  assert.ok(validateReport({ ...source, isDuplicate: 'true' }).length)
  assert.ok(validateReport({ ...source, duplicateOfReportId: source.id }).length)
})

test('duplicate RPC preserves expected version and propagates failures without previewing persistence', async () => {
  const report = { ...records()[0], version: 8 }
  const calls = []
  const client = { rpc: async (name, params) => { calls.push({ name, params }); return { error: null } } }
  await saveReportDuplicate(client, report, 'original-id', ' Same incident ')
  await saveReportDuplicate(client, report, null, null)
  assert.equal(calls[0].name, 'set_report_duplicate')
  assert.deepEqual(calls[0].params, { p_id: report.id, p_original: 'original-id', p_reason: 'Same incident', p_version: 8 })
  assert.equal(calls[1].params.p_original, null)
  const failure = new Error('This report changed')
  await assert.rejects(saveReportDuplicate({ rpc: async () => ({ error: failure }) }, report, null, null), failure)
})
