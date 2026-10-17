import test from 'node:test'
import assert from 'node:assert/strict'
import { loadReportFeed, saveReportReview } from '../src/backend/reports.js'
import { reportsResponse } from '../src/data/reports.js'
import { validateReport } from '../src/models/report.js'

const fixture = () => structuredClone(reportsResponse)

test('coordinate-only mobile reports and unknown injury counts are accepted without inventing an address or count', () => {
  const report = fixture().data[0]
  report.location.address = null
  report.injuries = { status: 'injured', injuredCount: null, fatalityCount: 0 }
  assert.deepEqual(validateReport(report), [])
  report.location.coordinates = null
  assert.ok(validateReport(report).length)
})

test('private storage paths are exchanged for expiring evidence URLs', async () => {
  const response = fixture()
  response.data[0].evidence = [{ id: 'photo', fileName: 'photo.jpg', mimeType: 'image/jpeg', storagePath: 'owner/report/photo.jpg', url: null }]
  let signedPaths
  const client = {
    rpc: async (name) => { assert.equal(name, 'get_report_feed'); return { data: response, error: null } },
    storage: { from: (bucket) => {
      assert.equal(bucket, 'accident-evidence')
      return { createSignedUrls: async (paths, seconds) => {
        signedPaths = paths; assert.equal(seconds, 600)
        return { data: [{ path: paths[0], signedUrl: 'https://example.test/signed/photo.jpg?token=temporary' }], error: null }
      } }
    } },
  }
  const feed = await loadReportFeed(client)
  assert.deepEqual(signedPaths, ['owner/report/photo.jpg'])
  assert.match(feed.data[0].evidence[0].url, /token=temporary/)
  assert.equal(response.data[0].evidence[0].url, null, 'Original data should not be mutated')
})

test('review writes send expected version and report backend conflicts rather than previewing a save', async () => {
  const conflict = new Error('This report changed. Refresh it before saving.')
  const report = { ...fixture().data[0], version: 7 }
  const patch = { status: 'Verified', assignedOfficerId: null, officialRemarks: 'Checked', rejectionReason: null }
  const client = { rpc: async (name, params) => {
    assert.equal(name, 'update_accident_report')
    assert.equal(params.p_version, 7)
    assert.equal(params.p_id, report.id)
    assert.equal(params.p_status, 'Verified')
    return { error: conflict }
  } }
  await assert.rejects(saveReportReview(client, report, patch), conflict)
})

test('backend read errors do not silently fall back to fabricated reports', async () => {
  await assert.rejects(loadReportFeed({ rpc: async () => ({ data: null, error: new Error('Not authorized') }) }), /Not authorized/)
})
