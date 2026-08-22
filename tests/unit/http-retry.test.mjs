/**
 * HTTP layer tests against a real local server: retry, error mapping,
 * timeout and query serialization.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { requestJson, PolymarketHttpError, PolymarketGeoBlockedError } from '../../lib/http.js'

const HTTP_CONFIG = { timeoutMs: 2_000, maxRetries: 2, userAgent: 'test-agent' }

function startServer(handler) {
  const server = http.createServer(handler)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

test('retries transient 5xx and succeeds', async () => {
  let hits = 0
  const server = await startServer((req, res) => {
    hits++
    if (hits < 3) { res.writeHead(503); res.end('boom') } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') }
  })
  try {
    const port = server.address().port
    const result = await requestJson(`http://127.0.0.1:${port}/x`, {}, HTTP_CONFIG)
    assert.deepEqual(result, { ok: true })
    assert.equal(hits, 3)
  } finally { server.close() }
})

test('honours a numeric Retry-After hint before retrying', async () => {
  let hits = 0
  const gaps = []
  let last = Date.now()
  const server = await startServer((req, res) => {
    hits += 1
    gaps.push(Date.now() - last)
    last = Date.now()
    if (hits === 1) { res.writeHead(429, { 'retry-after': '1' }); res.end('slow down') } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') }
  })
  try {
    const port = server.address().port
    const result = await requestJson(`http://127.0.0.1:${port}/x`, {}, HTTP_CONFIG)
    assert.deepEqual(result, { ok: true })
    assert.equal(hits, 2)
    // Wait must respect the 1s hint minus worst-case jitter (x0.75 floor);
    // default exponential backoff alone would fire well under 700ms.
    assert.ok(gaps[1] >= 700, `second attempt waited ${gaps[1]}ms for Retry-After: 1`)
  } finally { server.close() }
})

test('exhausted retries surface the last status as PolymarketHttpError', async () => {
  let hits = 0
  const server = await startServer((req, res) => {
    hits += 1
    res.writeHead(503)
    res.end('still down')
  })
  try {
    const port = server.address().port
    await assert.rejects(
      () => requestJson(`http://127.0.0.1:${port}/x`, {}, HTTP_CONFIG),
      (error) => {
        assert.ok(error instanceof PolymarketHttpError, 'is PolymarketHttpError')
        assert.equal(error.status, 503)
        return true
      },
    )
    // initial attempt + maxRetries retries
    assert.equal(hits, HTTP_CONFIG.maxRetries + 1)
  } finally { server.close() }
})

test('honours an HTTP-date Retry-After hint', async () => {
  let hits = 0
  const gaps = []
  let last = Date.now()
  const server = await startServer((req, res) => {
    hits += 1
    gaps.push(Date.now() - last); last = Date.now()
    // toUTCString has second granularity: an "now+3s" date carries an
    // effective hint of 2–3s; x0.75 jitter floor keeps the wait above 1400ms,
    // clearly separating it from the ~1s default backoff.
    if (hits === 1) { res.writeHead(429, { 'retry-after': new Date(Date.now() + 3000).toUTCString() }); res.end('slow') } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":1}') }
  })
  try {
    const port = server.address().port
    const result = await requestJson(`http://127.0.0.1:${port}/x`, {}, HTTP_CONFIG)
    assert.deepEqual(result, { ok: 1 })
    assert.ok(gaps[1] >= 1400, `waited ${gaps[1]}ms for date-form Retry-After`)
  } finally { server.close() }
})

test('non-2xx maps to PolymarketHttpError with API detail', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(422, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'order fields are not valid' }))
  })
  try {
    const port = server.address().port
    await assert.rejects(
      () => requestJson(`http://127.0.0.1:${port}/markets`, { query: { order: 'volume_24hr' } }, HTTP_CONFIG),
      (error) => error instanceof PolymarketHttpError
        && error.status === 422
        && error.message.includes('order fields are not valid')
        && error.url.includes('order=volume_24hr'),
    )
  } finally { server.close() }
})

test('403 blocked body raises PolymarketGeoBlockedError', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(403, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ blocked: true, country: 'XX' }))
  })
  try {
    const port = server.address().port
    await assert.rejects(
      () => requestJson(`http://127.0.0.1:${port}/x`, {}, HTTP_CONFIG),
      (error) => error instanceof PolymarketGeoBlockedError && error.country === 'XX',
    )
  } finally { server.close() }
})

test('query params serialize arrays and skip undefined', async () => {
  let seen = ''
  const server = await startServer((req, res) => {
    seen = req.url
    res.writeHead(200); res.end('{}')
  })
  try {
    const port = server.address().port
    await requestJson(`http://127.0.0.1:${port}/q`, {
      query: { a: undefined, b: ['x', 'y'], c: true },
    }, HTTP_CONFIG)
    assert.equal(seen, '/q?b=x&b=y&c=true')
  } finally { server.close() }
})

test('timeout produces a retry then failure', async () => {
  const server = await startServer((req, res) => { /* never respond */ })
  try {
    const port = server.address().port
    await assert.rejects(
      () => requestJson(`http://127.0.0.1:${port}/slow`, {}, { timeoutMs: 100, maxRetries: 0, userAgent: 't' }),
      (error) => /failed/i.test(error.message),
    )
  } finally { server.close() }
})
