import test from 'node:test'
import assert from 'node:assert/strict'
import { loginIdentity } from '../src/backend/username.js'

test('Username login is case-insensitive, preserves Admin, and supports existing email accounts', () => {
  assert.equal(loginIdentity(' Admin '), 'admin@roadsafe.local')
  assert.equal(loginIdentity('Driver_123'), 'driver_123@roadsafe.local')
  assert.equal(loginIdentity(' Existing@Example.com '), 'existing@example.com')
  for (const invalid of ['ab', 'name with space', '1driver', 'a'.repeat(25)]) assert.throws(() => loginIdentity(invalid))
})
