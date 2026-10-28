import test from 'node:test'
import assert from 'node:assert/strict'

test('Vercel station endpoint preserves validation, results and provider failures', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let unavailable = false
  globalThis.fetch = async () => {
    calls++
    if (unavailable) return { ok: false, status: 504 }
    return { ok: true, json: async () => ({ elements: [{ type: 'node', id: 17, lat: 14.55, lon: 121.05 }] }) }
  }
  const { default: handler } = await import('../api/stations.js')
  async function invoke(url, method = 'GET') {
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, end(body) { this.body = body } }
    await handler({ url, method }, res)
    return res
  }
  try {
    assert.equal((await invoke('/api/stations?type=bad')).statusCode, 400)
    const rejected = await invoke('/api/stations?type=police', 'POST')
    assert.equal(rejected.statusCode, 405)
    assert.equal(rejected.headers.Allow, 'GET')
    assert.equal(calls, 0)
    for (const type of ['police', 'medical']) {
      const national = await invoke(`/api/stations?type=${type}&scope=philippines`)
      assert.equal(national.statusCode, 200)
      const elements = JSON.parse(national.body).elements
      assert.ok(elements.length > 0)
      assert.ok(elements.every(item => Number.isFinite(item.lat ?? item.center?.lat) && Number.isFinite(item.lon ?? item.center?.lon)))
    }
    assert.equal(calls, 0)
    const success = await invoke('/api/stations?type=police&bounds=14.5,121,14.6,121.1')
    assert.equal(success.statusCode, 200)
    assert.match(success.headers['Content-Type'], /application\/json/)
    assert.equal(JSON.parse(success.body).elements[0].id, 17)
    unavailable = true
    const failed = await invoke('/api/stations?type=medical&bounds=14.5,121,14.6,121.1')
    assert.equal(failed.statusCode, 503)
    assert.match(JSON.parse(failed.body).error, /temporarily unavailable/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
