/**
 * L2 HMAC signature tests — golden vectors computed independently from the
 * documented algorithm (base64decode(secret) as HMAC-SHA256 key over
 * `timestamp + METHOD + path[+body]`, base64 digest).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildL2Headers } from '../../lib/clob.js'

const CREDS = {
  apiKey: '00000000-0000-0000-0000-000000000000',
  // base64 for "polymarket-test-secret"
  secret: Buffer.from('polymarket-test-secret').toString('base64'),
  passphrase: 'passphrase',
  address: '0x1234567890abcdef1234567890abcdef12345678',
  signatureType: 2,
}
const TIMESTAMP = '1700000000'

function expectedSignature(message) {
  return createHmac('sha256', Buffer.from(CREDS.secret, 'base64')).update(message).digest('base64')
}

test('GET without body signs timestamp+method+path-with-query', () => {
  const headers = buildL2Headers(CREDS, 'GET', '/data/orders?market=0xabc', undefined, TIMESTAMP)
  assert.equal(headers.POLY_ADDRESS, CREDS.address)
  assert.equal(headers.POLY_API_KEY, CREDS.apiKey)
  assert.equal(headers.POLY_PASSPHRASE, CREDS.passphrase)
  assert.equal(headers.POLY_TIMESTAMP, TIMESTAMP)
  const expected = expectedSignature(`${TIMESTAMP}GET/data/orders?market=0xabc`)
  assert.equal(headers.POLY_SIGNATURE, expected)
})

test('POST includes the JSON body in the signed message', () => {
  const body = JSON.stringify({ orderID: '0xdeadbeef' })
  const headers = buildL2Headers(CREDS, 'DELETE', '/order', body, TIMESTAMP)
  const expected = expectedSignature(`${TIMESTAMP}DELETE/order${body}`)
  assert.equal(headers.POLY_SIGNATURE, expected)
})

test('null-ish bodies are not appended', () => {
  for (const empty of [undefined, '', 'null', '""']) {
    const headers = buildL2Headers(CREDS, 'GET', '/balance-allowance', empty, TIMESTAMP)
    const expected = expectedSignature(`${TIMESTAMP}GET/balance-allowance`)
    assert.equal(headers.POLY_SIGNATURE, expected)
  }
})

test('timestamp defaults to current unix seconds when omitted', () => {
  const before = Math.floor(Date.now() / 1000)
  const headers = buildL2Headers(CREDS, 'GET', '/time')
  const after = Math.floor(Date.now() / 1000)
  const ts = Number(headers.POLY_TIMESTAMP)
  assert.ok(ts >= before && ts <= after, 'timestamp within bounds')
})
