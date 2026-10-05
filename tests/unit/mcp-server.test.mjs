/**
 * MCP stdio server tests: schema conversion, read-only exposure guarantee,
 * JSON-RPC dispatch semantics, and a real child-process smoke run.
 *
 * The fetch stub is installed BEFORE importing the server module so the whole
 * lib/ client graph resolves against it (same pattern as tools-mock.test.mjs).
 */
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const calls = []
const routes = []

globalThis.fetch = async (url, init = {}) => {
  const urlText = String(url)
  calls.push({ url: urlText, method: init.method ?? 'GET', body: init.body })
  for (const route of routes) {
    const match = route(urlText, init)
    if (match !== undefined) {
      const status = match.status ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Map([['retry-after', null]]),
        text: async () => JSON.stringify(match.body ?? {}),
      }
    }
  }
  return { ok: false, status: 404, headers: new Map(), text: async () => '{"error":"no route"}' }
}

const { createMcpServer, handleMessage, jsonSchemaFromParameters, pickProtocolVersion } =
  await import('../../scripts/mcp-server.mjs')

const server = createMcpServer()

// ── inputSchema conversion ────────────────────────────────────────────────

test('jsonSchemaFromParameters hoists required flags into the required array', () => {
  const schema = jsonSchemaFromParameters({
    query: { type: 'string', description: 'q', required: true },
    limit: { type: 'number', description: 'n' },
    flag: { type: 'boolean', description: 'f' },
    order: { type: 'string', enum: ['a', 'b'], description: 'o' },
    tags: { type: 'array', items: { type: 'string' }, description: 't' },
  })
  assert.deepEqual(schema.required, ['query'])
  assert.equal(schema.type, 'object')
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.query.type, 'string')
  assert.equal(schema.properties.query.required, undefined)
  assert.deepEqual(schema.properties.order.enum, ['a', 'b'])
  assert.deepEqual(schema.properties.tags.items, { type: 'string' })
})

test('every exposed tool carries a well-formed MCP description', () => {
  for (const tool of server.listTools()) {
    assert.match(tool.name, /^polymarket_[a-z_]+$/, tool.name)
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 10, tool.name)
    assert.equal(tool.inputSchema.type, 'object', tool.name)
    assert.ok(Array.isArray(tool.inputSchema.required), tool.name)
  }
})

// ── read-only exposure guarantee ──────────────────────────────────────────

test('server never exposes trading/account/perps-account tools', async () => {
  const forbidden = /place_order|cancel|heartbeat|api_keys|balance_allowance|account_|perps_account/
  const names = [...server.tools.keys()]
  assert.ok(names.length >= 20, `expected a rich read-only set, got ${names.length}`)
  const leaked = names.filter((n) => forbidden.test(n))
  assert.deepEqual(leaked, [], 'account/order tools must not be exposed over MCP')
})

test('service is built without credentials even when env vars exist', () => {
  assert.equal(server.service.tradingCredentials, undefined)
  assert.equal(server.service.perpsCredentials, undefined)
})

// ── JSON-RPC dispatch ─────────────────────────────────────────────────────

test('initialize echoes a supported protocol version and advertises tools', async () => {
  const res = await handleMessage(server, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })
  assert.equal(res.id, 1)
  assert.equal(res.result.protocolVersion, '2024-11-05')
  assert.deepEqual(res.result.capabilities.tools, { listChanged: false })
  assert.equal(res.result.serverInfo.name, 'polymarket-knowhow')
})

test('initialize falls back to the newest supported version on unknown requests', async () => {
  const res = await handleMessage(server, { id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
  assert.equal(res.result.protocolVersion, pickProtocolVersion(undefined))
})

test('notifications yield no response', async () => {
  assert.equal(await handleMessage(server, { method: 'notifications/initialized' }), undefined)
  assert.equal(await handleMessage(server, { method: 'notifications/cancelled' }), undefined)
})

test('ping answers an empty result', async () => {
  const res = await handleMessage(server, { id: 3, method: 'ping' })
  assert.deepEqual(res.result, {})
})

test('unknown methods return -32601 only when they are requests', async () => {
  const res = await handleMessage(server, { id: 4, method: 'resources/list' })
  assert.equal(res.error.code, -32601)
  assert.equal(await handleMessage(server, { method: 'resources/list' }), undefined)
})

test('tools/list returns every registered tool with its schema', async () => {
  const res = await handleMessage(server, { id: 5, method: 'tools/list' })
  assert.equal(res.result.tools.length, server.tools.size)
  const byName = new Map(res.result.tools.map((t) => [t.name, t]))
  assert.ok(byName.has('polymarket_quote'))
  assert.equal(byName.get('polymarket_quote').inputSchema.type, 'object')
})

test('tools/call executes through the stubbed fetch and wraps output as text content', async () => {
  routes.push((url) => {
    if (url.includes('gamma-api.polymarket.com') && url.includes('/events')) {
      return { body: [{ id: 7, title: 'Test event', slug: 'test-event', markets: [] }] }
    }
    return undefined
  })
  const res = await handleMessage(server, { id: 6, method: 'tools/call', params: { name: 'polymarket_events_list', arguments: { limit: 1 } } })
  assert.equal(res.error, undefined)
  assert.equal(res.result.isError, undefined)
  assert.equal(res.result.content[0].type, 'text')
  const parsed = JSON.parse(res.result.content[0].text)
  assert.equal(parsed.count, 1)
  assert.equal(parsed.events[0].title, 'Test event')
})

test('tools/call reports failures via isError instead of rejecting', async () => {
  const res = await handleMessage(server, { id: 7, method: 'tools/call', params: { name: 'polymarket_no_such_tool', arguments: {} } })
  assert.equal(res.result.isError, true)
  assert.match(res.result.content[0].text, /Unknown tool/)
})

test('oversized results are truncated with a marker', async () => {
  routes.push((url) => (url.includes('/truncated-endpoint') ? { body: { pad: 'x'.repeat(60_000) } } : undefined))
  // Use any tool but force a huge response by routing its endpoint; search fits.
  routes.unshift((url) => (url.includes('/public-search') ? { body: { pad: 'x'.repeat(60_000) } } : undefined))
  const res = await handleMessage(server, { id: 8, method: 'tools/call', params: { name: 'polymarket_search', arguments: { query: 'big' } } })
  const text = res.result.content[0].text
  assert.ok(text.length < 30_000)
  assert.match(text, /truncated by polymarket-knowhow MCP server/)
})

// ── child-process stdio smoke ─────────────────────────────────────────────

test('stdio transport speaks newline-delimited JSON-RPC end to end', async () => {
  const { spawn } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const repoDir = fileURLToPath(new URL('../..', import.meta.url))
  const child = spawn(process.execPath, ['scripts/mcp-server.mjs'], { cwd: repoDir, stdio: ['pipe', 'pipe', 'pipe'] })
  let buffered = ''
  const responses = new Map()
  child.stdout.setEncoding('utf8')
  const done = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error('stdio smoke timeout')), 10_000)
    child.stdout.on('data', (chunk) => {
      buffered += chunk
      let i
      while ((i = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, i).trim()
        buffered = buffered.slice(i + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        if (msg.id !== undefined && msg.id !== null) responses.set(msg.id, msg)
        if (responses.has(1) && responses.has(2)) {
          clearTimeout(timer)
          resolvePromise()
        }
      }
    })
    child.on('exit', (code) => { if (responses.size < 2) rejectPromise(new Error('server exited early: ' + code)) })
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n')
  await done
  const pkgVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
  assert.equal(responses.get(1).result.serverInfo.version, pkgVersion)
  assert.ok(responses.get(2).result.tools.length >= 20)
  child.kill()
})
