/**
 * Live smoke tests against the real Polymarket APIs (read-only, no keys).
 * Run with: npm run test:live
 * These verify the plugin against production behavior; they skip politely
 * when the network is unavailable.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

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

test('data-api: trades and leaderboard', options, async () => {
  const trades = await dataApi.trades({ limit: 3 })
  assert.ok(Array.isArray(trades) && trades.length > 0)
  assert.ok(trades[0].proxyWallet !== undefined)
  const leaderboard = await dataApi.leaderboard({ window: 'all', limit: 3 })
  assert.ok(Array.isArray(leaderboard) && leaderboard.length > 0)
  assert.ok(leaderboard[0].proxyWallet !== undefined)
})

test('data-api: open interest global + live volume shape', options, async () => {
  const oi = await dataApi.openInterest({ global: true })
  assert.ok(Array.isArray(oi) && oi[0].value > 0)
})

test('data-api: positions endpoint reachable', options, async () => {
  const positions = await dataApi.positions({ user: '0x3873a776ec793da1c6fec49dafdd06bcc5e8dec8', limit: 5 })
  assert.ok(Array.isArray(positions))
})

test('geoblock check responds', options, async () => {
  const status = await checkGeoblock('https://polymarket.com/api/geoblock', HTTP)
  assert.equal(typeof status.blocked, 'boolean')
  assert.ok(typeof status.country === 'string')
})
