/**
 * Live smoke tests against the real Polymarket APIs (read-only, no keys).
 * Run with: npm run test:live
 * These verify the plugin against production behavior; they skip politely
 * when the network is unavailable.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const perpsOnline = await fetch('https://api.perpetuals.polymarket.com/v1/info/ping', { signal: AbortSignal.timeout(8000) })
  .then((r) => r.ok).catch(() => false)

const online = await fetch('https://gamma-api.polymarket.com/status', { signal: AbortSignal.timeout(8000) })
  .then((r) => r.ok).catch(() => false)
const options = { skip: online ? false : 'Polymarket APIs unreachable' }

const { GammaClient } = await import('../../lib/gamma.js')
const { DataApiClient } = await import('../../lib/data.js')
const { ClobClient } = await import('../../lib/clob.js')
const { checkGeoblock } = await import('../../lib/extras.js')

const HTTP = { timeoutMs: 15_000, maxRetries: 1, userAgent: 'dsh-polymarket-knowhow-live-test' }
const gamma = new GammaClient('https://gamma-api.polymarket.com', HTTP)
const dataApi = new DataApiClient('https://data-api.polymarket.com', HTTP)
const clob = new ClobClient('https://clob.polymarket.com', HTTP)

test('gamma: list active events', options, async () => {
  const events = await gamma.listEvents({ active: true, closed: false, limit: 3, order: 'volume24hr' })
  assert.ok(Array.isArray(events) && events.length > 0)
  assert.ok(events[0].id !== undefined)
  assert.ok(events[0].title !== undefined)
})

test('gamma: search returns events', options, async () => {
  const result = await gamma.search({ q: 'fed', eventsStatus: 'active', limitPerType: 2 })
  assert.ok(Array.isArray(result.events) && result.events.length > 0)
})

test('gamma: volume_24hr underscore sort is rejected with 422', options, async () => {
  await assert.rejects(
    () => gamma.listEvents({ limit: 1, order: 'volume_24hr' }),
    (error) => error.status === 422,
  )
})

test('clob: book, midpoint, spread, tick size, neg risk for one token', options, async () => {
  const markets = await gamma.listMarkets({ active: true, closed: false, limit: 5 })
  const withTokens = markets.find((m) => m.clobTokenIds !== undefined)
  assert.ok(withTokens, 'found a market with clob tokens')
  const tokenId = JSON.parse(withTokens.clobTokenIds)[0]
  const [book, mid, spread, tick, negRisk] = await Promise.all([
    clob.getBook(tokenId),
    clob.getMidpoint(tokenId),
    clob.getSpread(tokenId),
    clob.getTickSize(tokenId),
    clob.getNegRisk(tokenId),
  ])
  assert.equal(book.asset_id, tokenId)
  assert.match(String(mid.mid), /^0\.\d+$/)
  assert.ok(spread.spread !== undefined)
  assert.ok(tick.minimum_tick_size !== undefined)
  assert.equal(typeof negRisk.neg_risk, 'boolean')
})

test('clob: prices-history with interval', options, async () => {
  const markets = await gamma.listMarkets({ active: true, closed: false, limit: 3 })
  const tokenId = JSON.parse(markets.find((m) => m.clobTokenIds !== undefined).clobTokenIds)[0]
  const history = await clob.getPricesHistory({ market: tokenId, interval: '1d', fidelity: 60 })
  assert.ok(Array.isArray(history.history) && history.history.length > 0)
  assert.ok(typeof history.history[0].t === 'number')
})

test('clob: batch books and midpoints return every token', options, async () => {
  const markets = await gamma.listMarkets({ active: true, closed: false, limit: 4 })
  const tokens = markets.slice(0, 2).map((m) => JSON.parse(m.clobTokenIds)[0])
  const books = await clob.getBooks(tokens)
  assert.equal(books.length, tokens.length)
  // Production may reorder responses; assert set-equality of returned ids.
  assert.deepEqual([...books.map((b) => b.asset_id)].sort(), [...tokens].sort())
  const mids = await clob.getMidpoints(tokens)
  for (const token of tokens) {
    assert.ok(typeof mids[token] === 'string' && mids[token].length > 0, `midpoint for ${token}`)
  }
})

test('data-api v2: trades and leaderboard envelopes', options, async () => {
  const trades = await dataApi.trades({ limit: 3 })
  assert.ok(Array.isArray(trades.data) && trades.data.length > 0)
  assert.ok(trades.data[0].proxy_wallet !== undefined, 'v2 trades are snake_case (proxy_wallet)')
  assert.ok(trades.data[0].token_id !== undefined, 'v2 trades rename asset → token_id')
  assert.ok(trades.pagination?.next_cursor !== undefined, 'v2 exposes a cursor')
  const leaderboard = await dataApi.leaderboard({ timePeriod: 'ALL', limit: 3 })
  assert.ok(Array.isArray(leaderboard.data) && leaderboard.data.length > 0)
  assert.ok(leaderboard.data[0].user_id !== undefined, 'v2 leaderboard rows carry user_id')
})

test('data-api v2: open interest global', options, async () => {
  const oi = await dataApi.openInterest({ global: true })
  assert.ok(Array.isArray(oi.data) && oi.data[0].value > 0)
})

test('data-api v2: positions + user stats endpoint reachable', options, async () => {
  const user = '0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8'
  const positions = await dataApi.positions({ user, limit: 5 })
  assert.ok(Array.isArray(positions.data))
  const stats = await dataApi.userStats(user)
  assert.ok(stats.data !== null && typeof stats.data === 'object')
  assert.ok(stats.data.trades !== undefined, 'user-stats exposes the traded-market count')
})

test('data-api v2: holders by condition id', options, async () => {
  const markets = await gamma.listMarkets({ active: true, closed: false, limit: 5 })
  const conditionId = markets.find((m) => typeof m.conditionId === 'string')?.conditionId
  assert.ok(conditionId, 'found a market condition id')
  const holders = await dataApi.holders({ condition: conditionId, limit: 5 })
  assert.ok(Array.isArray(holders.data), 'holders returns the v2 data array')
})

test('data-api v2: status + value + approvals reachable', options, async () => {
  const status = await dataApi.status()
  assert.ok(status.data?.computed_at !== undefined)
  const value = await dataApi.value('0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8')
  assert.ok(value.data?.value !== undefined, 'value returns the data object')
  const approvals = await dataApi.approvals('0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8')
  assert.ok(approvals.data?.contracts !== undefined, 'approvals lists contract rows')
})

test('data-api v2: activity single-type filter applies (P13 guard)', options, async () => {
  const page = await dataApi.activity({ user: '0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8', type: ['TRADE'], limit: 20 })
  assert.ok(Array.isArray(page.data) && page.data.length > 0, 'activity returns rows for a heavy trader')
  for (const row of page.data) assert.equal(row.type, 'TRADE', 'every row matches the requested single type')
  // Multi-type is rejected locally (production has no working multi-type form).
  await assert.rejects(
    () => dataApi.activity({ user: '0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8', type: ['TRADE', 'REDEEM'] }),
    /single `type` per request/,
  )
})

test('geoblock check responds', options, async () => {
  const status = await checkGeoblock('https://polymarket.com/api/geoblock', HTTP)
  assert.equal(typeof status.blocked, 'boolean')
  assert.ok(typeof status.country === 'string')
})

test('perps: public info endpoints accept numeric instrument_id', { skip: perpsOnline ? false : 'Perps API unreachable' }, async () => {
  const { PerpsClient } = await import('../../lib/perps.js')
  const perps = new PerpsClient('https://api.perpetuals.polymarket.com', {
    timeoutMs: 15_000, maxRetries: 1, userAgent: 'dsh-polymarket-knowhow-live',
  })
  const instruments = await perps.instruments()
  assert.ok(Array.isArray(instruments) && instruments.length > 0, 'instruments listed')
  const instrumentId = Number(instruments[0].instrument_id)
  assert.ok(Number.isFinite(instrumentId), 'instrument_id is numeric')
  // Live regression for the audit finding: the parameter name is
  // instrument_id (numeric); symbolic ids are rejected on /v1/info/*.
  const bbo = await perps.bestBidOffer({ instrument_id: instrumentId })
  assert.ok(bbo !== undefined)
  const now = Date.now()
  const klines = await perps.klines({ instrument_id: instrumentId, interval: '1h', start_timestamp: now - 3_600_000 })
  assert.equal(klines?.status === undefined || klines?.data !== undefined, true, 'klines accepted interval enum + ms timestamps')
})
