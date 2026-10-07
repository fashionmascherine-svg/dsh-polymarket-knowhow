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
  // Simulate fully resolved credentials so the registration gates (opt-in AND
  // creds present) can be exercised in both directions.
  if (serviceOverrides?.withCreds === true) {
    Object.defineProperty(service, 'tradingCredentials', { value: { apiKey: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p', address: '0xabc', signatureType: 2 } })
    Object.defineProperty(service, 'perpsCredentials', { value: { proxy: '0xproxy', secret: 'sec' } })
    // The ClobClient snapshots credentials at construction; mirror them so
    // l2-signed tool calls can run against the stubbed fetch.
    Object.defineProperty(service.clob, 'credentials', { value: { apiKey: 'k', secret: Buffer.from('s').toString('base64'), passphrase: 'p', address: '0xabc', signatureType: 2 } })
  }
  const registered = new Map()
  const fakeCtx = {
    tools: { register: (definition) => { registered.set(definition.name, definition) } },
    skills: { register() {} },
    logger: { warn() {}, info() {} },
  }
  const config = {
    trading: { enabled: serviceOverrides?.trading?.enabled === true },
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
    'polymarket_portfolio_value', 'polymarket_user_stats', 'polymarket_resolutions',
    'polymarket_approvals', 'polymarket_geoblock_check', 'polymarket_combo_markets',
    'polymarket_knowledge',
  ]) {
    assert.ok(tools.has(expected), `missing tool ${expected}`)
  }
  assert.equal(tools.size, 25, 'exactly the 25 core tools when trading/perps off')
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

test('price batch posts spec-uppercase sides', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url, init) => (url.includes('/prices') && init.method === 'POST' ? { body: { ok: 1 } } : undefined))
  await tools.get('polymarket_price').execute({ token_ids: ['A', 'B'], side: 'SELL' }, EXEC)
  const sent = JSON.parse(calls.at(-1).body)
  assert.deepEqual(sent, [
    { token_id: 'A', side: 'SELL' },
    { token_id: 'B', side: 'SELL' },
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

test('positions hits the v2 route, lowercases the user and returns the envelope', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/positions') ? { body: { data: [{ proxy_wallet: '0xabc' }], pagination: { has_more: true, next_cursor: 'CUR' } } } : undefined))
  const result = await tools.get('polymarket_positions').execute({ user: '0xABCDEF' }, EXEC)
  const last = calls.at(-1).url
  assert.ok(last.includes('/v2/positions'), `v2 route used (${last})`)
  assert.ok(last.includes('user=0xabcdef'))
  assert.equal(result.count, 1)
  assert.equal(result.positions[0].proxy_wallet, '0xabc')
  assert.equal(result.pagination.next_cursor, 'CUR')
})

test('trades_public passes condition + cursor to the v2 route', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/trades') ? { body: { data: [], pagination: { has_more: false, next_cursor: null } } } : undefined))
  await tools.get('polymarket_trades_public').execute({ condition: '0xC1,0xC2', cursor: 'N', taker_only: false }, EXEC)
  const last = decodeURIComponent(calls.at(-1).url)
  assert.ok(last.includes('/v2/trades'), `v2 route used (${last})`)
  assert.ok(last.includes('condition=0xC1,0xC2'), 'comma-joined condition filter')
  assert.ok(last.includes('cursor=N'))
  assert.ok(last.includes('taker_only=false'))
})

test('activity client contract: single type serializes plain, multi-type is rejected', async () => {
  const dataApi = new DataApiClient('https://data-api.polymarket.com', { timeoutMs: 5000, maxRetries: 0, userAgent: 'test' })
  routes.length = 0
  routes.push((url) => (url.includes('/v2/activity') ? { body: { data: [], pagination: { has_more: false, next_cursor: null } } } : undefined))
  // Single type → the only wire form production actually filters (one plain `type=` key).
  await dataApi.activity({ user: '0xABC', type: ['TRADE'], limit: 5 })
  const single = decodeURIComponent(calls.at(-1).url)
  assert.ok(single.includes('type=TRADE'), `plain single type= key (${single})`)
  assert.equal((single.match(/type=/g) ?? []).length, 1, 'exactly one type= key')
  // Multi-type → loud local rejection; production either 400s (repeated keys)
  // or returns 200 unfiltered (bracket/CSV forms), so never send it.
  await assert.rejects(
    () => dataApi.activity({ user: '0xABC', type: ['TRADE', 'REDEEM'] }),
    /single `type` per request/,
  )
  // No type at all stays fine.
  await dataApi.activity({ user: '0xABC', limit: 1 })
  assert.ok(!calls.at(-1).url.includes('type='), 'no type key when unset')
})

test('activity tool forwards a single type', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/v2/activity') ? { body: { data: [], pagination: { has_more: false, next_cursor: null } } } : undefined))
  await tools.get('polymarket_activity').execute({ user: '0xABC', type: 'REDEEM' }, EXEC)
  const last = decodeURIComponent(calls.at(-1).url)
  assert.ok(last.includes('/v2/activity'), `v2 route used (${last})`)
  assert.ok(last.includes('type=REDEEM'), 'single type forwarded as plain key')
  assert.equal((last.match(/type=/g) ?? []).length, 1, 'exactly one type= key on the wire')
})

test('leaderboard tool forwards the v2 cursor', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/v2/leaderboard') ? { body: { data: [], pagination: { has_more: false, next_cursor: null } } } : undefined))
  await tools.get('polymarket_leaderboard').execute({ window: 'all', cursor: 'N' }, EXEC)
  const last = calls.at(-1).url
  assert.ok(last.includes('/v2/leaderboard'), `v2 route used (${last})`)
  assert.ok(last.includes('cursor=N'), 'cursor forwarded to the v2 route')
})

test('toSdkCredentials maps the stored apiKey shape to the SDK key shape', async () => {
  const { toSdkCredentials } = await import('../../lib/signing.js')
  assert.deepEqual(
    toSdkCredentials({ apiKey: 'K', secret: 'S', passphrase: 'P' }),
    { key: 'K', secret: 'S', passphrase: 'P' },
    '@polymarket/client validates credentials.key, not credentials.apiKey',
  )
})

test('live_volume uses id param', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => (url.includes('/live-volume') ? { body: { total: 5 } } : undefined))
  const result = await tools.get('polymarket_live_volume').execute({ event_id: '123' }, EXEC)
  assert.ok(calls.at(-1).url.includes('id=123'))
  assert.equal(result.total, 5)
})

test('trading tools register only when enabled AND credentials resolve', async () => {
  // enabled but NO resolved credentials → not registered (documented gate)
  const noCreds = await collectTools({ trading: { enabled: true } })
  assert.ok(!noCreds.has('polymarket_place_order'), 'no trading tools without creds')
  assert.equal(noCreds.size, 25)
  // enabled AND creds → the full 25 + 7 set
  const tools = await collectTools({ trading: { enabled: true }, withCreds: true })
  assert.ok(tools.has('polymarket_place_order'), 'trading tools registered when enabled+creds')
  for (const t of ['polymarket_account_orders', 'polymarket_account_trades', 'polymarket_cancel_orders', 'polymarket_balance_allowance', 'polymarket_heartbeat', 'polymarket_api_keys']) {
    assert.ok(tools.has(t), `missing ${t}`)
  }
  assert.equal(tools.size, 32, '25 core + 7 trading when perps off')
})

test('perps tools register only when enabled AND proxy/secret resolve', async () => {
  const off = await collectTools({})
  assert.ok(!off.has('polymarket_perps_market_data'))
  const on = await collectTools({ perps: { enabled: true }, withCreds: true })
  for (const t of ['polymarket_perps_market_data', 'polymarket_perps_account']) {
    assert.ok(on.has(t), `missing ${t}`)
  }
})

test('cancel_orders validates required args per mode', async () => {
  const config = { enabled: true }
  const tools = await collectTools({ trading: config, withCreds: true })
  await assert.rejects(
    () => tools.get('polymarket_cancel_orders').execute({ mode: 'single' }, EXEC),
    /requires order_id/,
  )
  await assert.rejects(
    () => tools.get('polymarket_cancel_orders').execute({ mode: 'batch', order_ids: [] }, EXEC),
    /requires order_ids/,
  )
})

test('cancel_orders happy paths hit the right wire endpoints per mode', async () => {
  const tools = await collectTools({ trading: { enabled: true }, withCreds: true })
  routes.length = 0
  calls.length = 0
  routes.push((url, init) => (init.method === 'DELETE' ? { body: { canceled: true } } : undefined))

  await tools.get('polymarket_cancel_orders').execute({ mode: 'single', order_id: '0x1' }, EXEC)
  let last = calls.at(-1)
  assert.ok(last.url.includes('/order'), `single -> /order (${last.url})`)
  assert.deepEqual(JSON.parse(last.body), { orderID: '0x1' })

  await tools.get('polymarket_cancel_orders').execute({ mode: 'batch', order_ids: ['a', 'b'] }, EXEC)
  last = calls.at(-1)
  assert.ok(last.url.includes('/orders'))
  assert.deepEqual(JSON.parse(last.body), ['a', 'b'], 'batch body is a FLAT id array')

  await tools.get('polymarket_cancel_orders').execute({ mode: 'all' }, EXEC)
  last = calls.at(-1)
  assert.ok(last.url.includes('/cancel-all'))

  await tools.get('polymarket_cancel_orders').execute({ mode: 'market', market_condition_id: '0xmkt', asset_id: '0xasset' }, EXEC)
  last = calls.at(-1)
  assert.ok(last.url.includes('/cancel-market-orders'))
  assert.deepEqual(JSON.parse(last.body), { market: '0xmkt', asset_id: '0xasset' })

  assert.equal(routes.filter(Boolean).length >= 1, true)
})

test('token_info surfaces the live taker-fee schedule and the legacy CLOB cap', async () => {
  const tools = await collectTools()
  routes.length = 0
  routes.push((url) => {
    if (url.includes('/tick-size')) return { body: { minimum_tick_size: '0.01' } }
    if (url.includes('/neg-risk')) return { body: { neg_risk: false } }
    if (url.includes('/markets-by-token')) return { body: { condition_id: '0xCOND', primary_token_id: 'T1' } }
    if (url.includes('/fee-rate')) return { body: { base_fee: 1000 } }
    if (url.includes('/markets?') && url.includes('condition_ids')) {
      return { body: [{ conditionId: '0xCOND', closed: false, feesEnabled: true, feeType: 'sports_fees_v3', feeSchedule: { rate: 0.05, exponent: 1, takerOnly: true, rebateRate: 0.15 } }] }
    }
    return undefined
  })
  const result = await tools.get('polymarket_token_info').execute({ token_id: 'T1' }, EXEC)
  assert.deepEqual(result.fees, {
    feesEnabled: true,
    feeType: 'sports_fees_v3',
    feeSchedule: { rate: 0.05, exponent: 1, takerOnly: true, rebateRate: 0.15 },
    closed: false,
  }, 'Gamma feeSchedule surfaced as the taker-fee source')
  assert.deepEqual(result.fee_rate_legacy, { base_fee: 1000 }, 'CLOB /fee-rate exposed as legacy cap, not the taker fee')
})

test('token_info retries Gamma with closed=true when the market is not open', async () => {
  const tools = await collectTools()
  routes.length = 0
  calls.length = 0
  routes.push((url) => {
    if (url.includes('/markets-by-token')) return { body: { condition_id: '0xCLOSED', primary_token_id: 'T9' } }
    if (url.includes('/fee-rate')) return { body: { base_fee: 1000 } }
    if (url.includes('/tick-size')) return { body: { minimum_tick_size: '0.001' } }
    if (url.includes('/neg-risk')) return { body: { neg_risk: false } }
    if (url.includes('/markets?') && url.includes('condition_ids=0xCLOSED')) {
      // First attempt (server default closed=false) finds nothing; only the
      // explicit closed=true retry resolves the just-closed market.
      if (url.includes('closed=true')) {
        return { body: [{ conditionId: '0xCLOSED', closed: true, feesEnabled: true, feeType: 'politics_fees', feeSchedule: { rate: 0.04, exponent: 1, takerOnly: true, rebateRate: 0.25 } }] }
      }
      return { body: [] }
    }
    return undefined
  })
  const result = await tools.get('polymarket_token_info').execute({ token_id: 'T9' }, EXEC)
  assert.equal(result.fees.feeType, 'politics_fees', 'closed-market feeSchedule surfaced via the retry')
  assert.equal(result.fees.closed, true)
  const gammaCalls = calls.filter((c) => c.url.includes('condition_ids=0xCLOSED'))
  assert.equal(gammaCalls.length, 2, 'exactly two Gamma lookups (open, then closed=true)')
  assert.ok(!gammaCalls[0].url.includes('closed=true'), 'first attempt omits closed (server default)')
  assert.ok(gammaCalls[1].url.includes('closed=true'), 'retry carries closed=true')
})

test('tick-size and neg-risk are memoized per token', async () => {
  const tools = await collectTools()
  routes.length = 0
  calls.length = 0
  let hits = 0
  routes.push((url) => {
    if (url.includes('/tick-size')) { hits += 1; return { body: { minimum_tick_size: '0.01' } } }
    if (url.includes('/neg-risk')) return { body: { neg_risk: false } }
    return undefined
  })
  await tools.get('polymarket_token_info').execute({ token_id: 'T1' }, EXEC)
  await tools.get('polymarket_token_info').execute({ token_id: 'T1' }, EXEC)
  const t1Hits = hits
  await tools.get('polymarket_token_info').execute({ token_id: 'T2' }, EXEC)
  assert.equal(t1Hits, 1, `second T1 call served from cache (got ${t1Hits} fetches)`)
  assert.ok(hits >= 2, 'different token bypasses the cache')
})

test('tool failure path surfaces a clean error to the runner', async () => {
  const tools = await collectTools()
  routes.length = 0
  calls.length = 0
  // No route matches → stubbed fetch returns 404 → PolymarketHttpError.
  await assert.rejects(
    () => tools.get('polymarket_event_get').execute({ event_id: '404-test' }, EXEC),
    (error) => /Polymarket API request failed|404/.test(String(error?.message)),
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
