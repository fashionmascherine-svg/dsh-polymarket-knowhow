/**
 * Tool-layer tests: register every tool against a mock context with a stubbed
 * global fetch, then drive the execute functions directly and assert URL
 * construction, parameter plumbing and error behavior.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// ── Stub global fetch BEFORE importing modules that use it at call time ──
const calls = []
/** @type {Array<(url: string, init: any) => { status?: number, body?: any }>} */
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

const { registerTools } = await import('../../lib/tools.js')
const { PolymarketService } = await import('../../lib/service.js')
const { GammaClient } = await import('../../lib/gamma.js')
const { DataApiClient } = await import('../../lib/data.js')
const { ClobClient } = await import('../../lib/clob.js')

function makeService(overrides = {}) {
  const config = {
    clobUrl: 'https://clob.polymarket.com',
    gammaUrl: 'https://gamma-api.polymarket.com',
    dataApiUrl: 'https://data-api.polymarket.com',
    perpsUrl: 'https://api.perpetuals.polymarket.com',
    rfqUrl: 'https://combos-rfq-api.polymarket.com',
    bridgeUrl: 'https://bridge.polymarket.com',
    relayerUrl: 'https://relayer-v2.polymarket.com',
    geoblockUrl: 'https://polymarket.com/api/geoblock',
    wsMarketUrl: 'wss://example.invalid/ws/market',
    wsUserUrl: 'wss://example.invalid/ws/user',
    timeoutMs: 5000,
    maxRetries: 0,
    userAgent: 'test',
    trading: { enabled: false, apiKey: '', secret: '', passphrase: '', address: '', signatureType: 2, allowEnvCredentials: false },
    perps: { enabled: false, proxy: '', secret: '', allowEnvCredentials: false },
    stream: { enabled: false, assetIds: [], pingIntervalMs: 10000, reconnectDelayMs: 1000 },
    skills: true,
    ...overrides,
  }
  const fakeCtx = { reflect: { provide() {} }, logger: { warn() {}, info() {} } }
  return new PolymarketService(fakeCtx, config)
}

async function collectTools(serviceOverrides = {}) {
  const service = makeService(serviceOverrides)
  const registered = new Map()
  const fakeCtx = {
    tools: { register: (definition) => { registered.set(definition.name, definition) } },
    skills: { register() {} },
    logger: { warn() {}, info() {} },
  }
  const config = {
    trading: { ...service.tradingCredentials, enabled: serviceOverrides?.trading?.enabled === true },
    perps: { enabled: serviceOverrides?.perps?.enabled === true },
  }
  registerTools(fakeCtx, service, config)
  return registered
}

const EXEC = { signal: new AbortController().signal }

test('registers the core read-only tools and no account tools when trading disabled', async () => {
  const tools = await collectTools()
  for (const expected of [
    'polymarket_search', 'polymarket_events_list', 'polymarket_event_get',
    'polymarket_markets_list', 'polymarket_market_get', 'polymarket_tags_list',
    'polymarket_orderbook', 'polymarket_price', 'polymarket_quote',
    'polymarket_price_history', 'polymarket_token_info', 'polymarket_positions',
    'polymarket_trades_public', 'polymarket_activity', 'polymarket_holders',
    'polymarket_leaderboard', 'polymarket_open_interest', 'polymarket_live_volume',
    'polymarket_portfolio_value', 'polymarket_geoblock_check', 'polymarket_combo_markets',
    'polymarket_knowledge',
  ]) {
    assert.ok(tools.has(expected), `missing tool ${expected}`)
  }
  assert.ok(!tools.has('polymarket_place_order'))
  assert.ok(!tools.has('polymarket_cancel_orders'))
})

test('events_list offset mode hits /events and prunes markets', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => {
    if (!url.includes('/events')) return undefined
    if (url.includes('keyset')) return undefined
    return { body: [{ id: '1', title: 'E', markets: [{ id: 'm1', description: 'x'.repeat(3000), events: ['nested'] }] }] }
  })
  const result = await tools.get('polymarket_events_list').execute({ limit: 5 }, EXEC)
  assert.equal(calls.at(-1).url, 'https://gamma-api.polymarket.com/events?limit=5')
  assert.equal(result.count, 1)
  const market = result.events[0].markets[0]
  assert.ok(market.description.endsWith('…'), 'long descriptions trimmed')
  assert.equal(market.events, undefined, 'nested events removed')
})

test('events_list keyset mode hits /events/keyset with cursor', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/events/keyset') ? { body: { data: [{ id: '9' }], cursor: 'NEXT' } } : undefined))
  const result = await tools.get('polymarket_events_list').execute({ after_cursor: 'CUR' }, EXEC)
  assert.ok(calls.at(-1).url.includes('/events/keyset'))
  assert.ok(calls.at(-1).url.includes('after_cursor=CUR'))
  assert.deepEqual(result.data, [{ id: '9' }])
})

test('orderbook batch posts wrapped params', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url, init) => (url.includes('/books') && init.method === 'POST'
    ? { body: [{ asset_id: 'T1', bids: [], asks: [] }] }
    : undefined))
  const result = await tools.get('polymarket_orderbook').execute({ token_ids: ['T1'] }, EXEC)
  const sent = JSON.parse(calls.at(-1).body)
  assert.deepEqual(sent, [{ token_id: 'T1' }])
  assert.equal(result.books[0].asset_id, 'T1')
})

test('price batch posts sides lowercased', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url, init) => (url.includes('/prices') && init.method === 'POST' ? { body: { ok: 1 } } : undefined))
  await tools.get('polymarket_price').execute({ token_ids: ['A', 'B'], side: 'SELL' }, EXEC)
  const sent = JSON.parse(calls.at(-1).body)
  assert.deepEqual(sent, [
    { token_id: 'A', side: 'sell' },
    { token_id: 'B', side: 'sell' },
  ])
})

test('quote composes midpoint, spread and last trade', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => {
    if (url.includes('/midpoint')) return { body: { mid: '0.50' } }
    if (url.includes('/spread')) return { body: { spread: '0.01' } }
    if (url.includes('/last-trade-price')) return { body: { price: '0.49' } }
    return undefined
  })
  const result = await tools.get('polymarket_quote').execute({ token_id: 'T' }, EXEC)
  assert.deepEqual(result, { token_id: 'T', mid: '0.50', spread: '0.01', last_trade: { price: '0.49' } })
})

test('positions lowercases the user address', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/positions') ? { body: [] } : undefined))
  await tools.get('polymarket_positions').execute({ user: '0xABCDEF' }, EXEC)
  assert.ok(calls.at(-1).url.includes('user=0xabcdef'))
})

test('live_volume uses id param', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/live-volume') ? { body: { total: 5 } } : undefined))
  const result = await tools.get('polymarket_live_volume').execute({ event_id: '123' }, EXEC)
  assert.ok(calls.at(-1).url.includes('id=123'))
  assert.equal(result.total, 5)
})

test('cancel_orders validates required args per mode', async () => {
  const config = { enabled: true, apiKey: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p', address: '0xabc', signatureType: 2, allowEnvCredentials: false }
  const tools = await collectTools({ trading: config })
  assert.ok(tools.has('polymarket_place_order'), 'trading tools registered when enabled')
  await assert.rejects(
    () => tools.get('polymarket_cancel_orders').execute({ mode: 'single' }, EXEC),
    /requires order_id/,
  )
  await assert.rejects(
    () => tools.get('polymarket_cancel_orders').execute({ mode: 'batch', order_ids: [] }, EXEC),
    /requires order_ids/,
  )
})

test('knowledge tool loads topics and searches', async () => {
  const tools = await collectTools()
  const overview = await tools.get('polymarket_knowledge').execute({}, EXEC)
  assert.ok(Array.isArray(overview.topics) && overview.topics.length >= 15)
  const perps = await tools.get('polymarket_knowledge').execute({ topic: 'perps' }, EXEC)
  assert.ok(perps.content.includes('api.perpetuals.polymarket.com'))
  const found = await tools.get('polymarket_knowledge').execute({ query: 'volume24hr' }, EXEC)
  assert.ok(found.matches.some((m) => m.topic === 'market-data' || m.topic === 'api-endpoints' || m.topic === 'SKILL'))
})

test('geoblock tool returns the check result', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/api/geoblock') ? { body: { blocked: false, country: 'IT' } } : undefined))
  const result = await tools.get('polymarket_geoblock_check').execute({}, EXEC)
  assert.deepEqual(result, { blocked: false, country: 'IT' })
})
