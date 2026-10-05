/**
 * Client for the Polymarket CLOB REST API.
 *
 * - Public market-data reads need no authentication.
 * - Account/trade endpoints require L2 headers: POLY_ADDRESS, POLY_SIGNATURE,
 *   POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE, where POLY_SIGNATURE is
 *   base64(HMAC-SHA256(base64decode(secret), timestamp + method + path [+ body]))
 *   and `path` INCLUDES the query string — matching the official clients.
 *
 * Order SIGNING (EIP-712) is intentionally not re-implemented here; see
 * `signing.ts` for the optional official-SDK integration used by the
 * opt-in `polymarket_place_order` tool.
 */
import { createHmac } from 'node:crypto'
import { requestJson, jsonBody, PolymarketHttpError, type HttpConfig, type RequestOptions } from './http.js'

export interface L2Credentials {
  apiKey: string
  secret: string
  passphrase: string
  address: string
  signatureType: number
}

export interface OrderBookLevel { price: string; size: string }

export interface OrderBook {
  market: string
  asset_id: string
  timestamp?: string
  hash?: string
  bids?: OrderBookLevel[]
  asks?: OrderBookLevel[]
  tick_size?: string
  neg_risk?: boolean
  min_order_size?: string
  [key: string]: unknown
}

export interface PriceHistoryPoint { t: number; p: number }

export const PRICE_HISTORY_INTERVALS = ['all', '1h', '6h', '1d', '1w', '1m', 'max'] as const
export type PriceHistoryInterval = typeof PRICE_HISTORY_INTERVALS[number]

/** Build the five L2 authentication headers for one request. */
export function buildL2Headers(
  creds: L2Credentials,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  pathWithQuery: string,
  body: string | undefined,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): Record<string, string> {
  let message = timestamp + method + pathWithQuery
  if (body !== undefined && body.length > 0 && body !== 'null' && body !== '""') {
    message += body
  }
  const base64Secret = Buffer.from(creds.secret, 'base64')
  const signature = createHmac('sha256', base64Secret).update(message).digest('base64')
  return {
    POLY_ADDRESS: creds.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
  }
}

interface ParsedPath {
  pathWithQuery: string
}

/** Options accepted by client request helpers. */
type RequestBodyOptions = Omit<RequestOptions, 'headers'> & { headers?: Record<string, string> }

function parseUrl(baseUrl: string, path: string, query?: RequestOptions['query']): ParsedPath & { url: URL } {
  // Normalize: baseUrl without trailing slash, path with leading slash.
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : '/' + path
  // Build query deterministically so the signed path matches the sent URL.
  const search = new URLSearchParams()
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item))
    }
  }
  const encoded = search.toString()
  const fullPath = encoded.length === 0 ? suffix : suffix + '?' + encoded
  return { url: new URL(normalizedBase + fullPath), pathWithQuery: fullPath }
}

/** TTL for rarely-changing per-token facts (tick size, neg-risk flag). */
const STATIC_TTL_MS = 5 * 60_000

export class ClobClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
    private credentials?: L2Credentials,
  ) {}

  setCredentials(creds: L2Credentials): void {
    this.credentials = creds
  }

  hasCredentials(): boolean {
    return this.credentials !== undefined
  }

  /** Public request: no auth headers. */
  private async public<T>(path: string, options: RequestBodyOptions = {}): Promise<T> {
    const parsed = parseUrl(this.baseUrl, path, options.query)
    return requestJson<T>(parsed.url.href, { ...options, query: undefined }, this.http)
  }

  /** Authenticated request: signs method + path-with-query (+ body). */
  private async l2<T>(
    path: string,
    options: RequestBodyOptions = {},
    required = true,
  ): Promise<T> {
    if (this.credentials === undefined) {
      throw new Error(
        required ? 'This operation requires Polymarket L2 API credentials (configure trading.apiKey/secret/passphrase/address or POLY_* environment variables)' : 'no credentials',
      )
    }
    const parsed = parseUrl(this.baseUrl, path, options.query)
    const body = options.body
    const headers = buildL2Headers(this.credentials, options.method ?? 'GET', parsed.pathWithQuery, body)
    return requestJson<T>(parsed.url.href, { ...options, query: undefined, headers }, this.http)
  }

  // ── Public reads ────────────────────────────────────────────────────────

  async getServerTime(): Promise<unknown> {
    return this.public('/time')
  }

  async getBook(tokenId: string): Promise<OrderBook> {
    return this.public('/book', { query: { token_id: tokenId } })
  }

  async getBooks(tokenIds: string[]): Promise<OrderBook[]> {
    // Live-verified: POST /books takes a FLAT array; the `params` wrapper
    // seen in older SDK code returns an empty array.
    const { body, headers } = jsonBody(tokenIds.map((id) => ({ token_id: id })))
    return this.public('/books', { method: 'POST', body, headers })
  }

  async getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<{ price: string }> {
    // Spec enum is BUY|SELL; production accepts both cases (live-verified) — send the spec form.
    return this.public('/price', { query: { token_id: tokenId, side: side.toUpperCase() } })
  }

  /** Live-verified flat payload; response maps token id -> {BUY|SELL: price}. */
  async getPrices(requests: Array<{ tokenId: string; side: 'BUY' | 'SELL' }>): Promise<Record<string, { BUY?: string; SELL?: string }>> {
    const { body, headers } = jsonBody(requests.map((r) => ({ token_id: r.tokenId, side: r.side.toUpperCase() })))
    return this.public('/prices', { method: 'POST', body, headers })
  }

  async getMidpoints(tokenIds: string[]): Promise<Record<string, string>> {
    const { body, headers } = jsonBody(tokenIds.map((id) => ({ token_id: id })))
    return this.public('/midpoints', { method: 'POST', body, headers })
  }

  async getSpreads(tokenIds: string[]): Promise<Record<string, string>> {
    const { body, headers } = jsonBody(tokenIds.map((id) => ({ token_id: id })))
    return this.public('/spreads', { method: 'POST', body, headers })
  }

  async getLastTradesPrices(tokenIds: string[]): Promise<Array<{ price: string; side?: string; token_id?: string }>> {
    const { body, headers } = jsonBody(tokenIds.map((id) => ({ token_id: id })))
    return this.public('/last-trades-prices', { method: 'POST', body, headers })
  }

  async getMidpoint(tokenId: string): Promise<{ mid: string }> {
    return this.public('/midpoint', { query: { token_id: tokenId } })
  }

  async getSpread(tokenId: string): Promise<{ spread: string }> {
    return this.public('/spread', { query: { token_id: tokenId } })
  }

  async getLastTradePrice(tokenId: string): Promise<{ price: string; side?: string; hash?: string; timestamp?: string }> {
    return this.public('/last-trade-price', { query: { token_id: tokenId } })
  }

  private readonly staticCache = new Map<string, { value: unknown; expires: number }>()

  /** Memoize a rarely-changing per-token fact for STATIC_TTL_MS. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.staticCache.get(key)
    if (hit !== undefined && hit.expires > Date.now()) return hit.value as T
    const value = await load()
    this.staticCache.set(key, { value, expires: Date.now() + STATIC_TTL_MS })
    return value
  }

  /** Tick size is fixed per market once listed — safe to memoize briefly. */
  async getTickSize(tokenId: string): Promise<{ minimum_tick_size: number | string }> {
    return this.cached(`tick:${tokenId}`, () => this.public('/tick-size', { query: { token_id: tokenId } }))
  }

  /** Neg-risk flag is a market-level constant — safe to memoize briefly. */
  async getNegRisk(tokenId: string): Promise<{ neg_risk: boolean }> {
    return this.cached(`negrisk:${tokenId}`, () => this.public('/neg-risk', { query: { token_id: tokenId } }))
  }

  /**
   * Price history for one asset. Either an interval OR an explicit
   * startTs/endTs range; `fidelity` is minutes between points (default 1).
   */
  async getPricesHistory(params: {
    market: string
    interval?: PriceHistoryInterval
    startTs?: number
    endTs?: number
    fidelity?: number
  }): Promise<{ history: PriceHistoryPoint[] }> {
    return this.public('/prices-history', {
      query: {
        market: params.market,
        interval: params.interval,
        startTs: params.startTs,
        endTs: params.endTs,
        fidelity: params.fidelity,
      },
    })
  }

  /** Batch price history, up to 20 markets per call (`POST /batch-prices-history`). */
  async getBatchPricesHistory(params: {
    markets: string[]
    startTs?: number
    endTs?: number
    interval?: PriceHistoryInterval
    fidelity?: number
  }): Promise<Array<{ market: string; history: PriceHistoryPoint[] }>> {
    const { body, headers } = jsonBody({
      markets: params.markets.slice(0, 20),
      start_ts: params.startTs,
      end_ts: params.endTs,
      interval: params.interval,
      fidelity: params.fidelity,
    })
    return this.public('/batch-prices-history', { method: 'POST', body, headers })
  }

  /** Resolve a CLOB token id back to its market (`GET /markets-by-token/{token_id}`). */
  async getMarketByToken(tokenId: string): Promise<unknown> {
    return this.public(`/markets-by-token/${encodeURIComponent(tokenId)}`)
  }

  /** CLOB-side market info by condition id. */
  async getClobMarket(conditionId: string): Promise<unknown> {
    return this.public(`/clob-markets/${encodeURIComponent(conditionId)}`)
  }

  /** Simplified markets listing (token ids, tick size, neg risk, min size). */
  async getSimplifiedMarkets(nextCursor?: string): Promise<unknown> {
    return this.public('/simplified-markets', nextCursor === undefined ? {} : { query: { next_cursor: nextCursor } })
  }

  async getFeeRate(tokenId?: string): Promise<unknown> {
    return tokenId === undefined ? this.public('/fee-rate') : this.public(`/fee-rate/${encodeURIComponent(tokenId)}`)
  }

  /** Current liquidity-reward configurations across markets. */
  async getRewardMarkets(): Promise<unknown> {
    return this.public('/rewards/markets/current')
  }

  // ── Authenticated (L2) operations ───────────────────────────────────────

  /** Open orders; filter by market (condition id) and/or asset id. */
  async getOrders(params: { market?: string; assetId?: string; id?: string } = {}): Promise<unknown> {
    return this.l2('/data/orders', { query: { market: params.market, asset_id: params.assetId, id: params.id } })
  }

  async getOrder(orderId: string): Promise<unknown> {
    return this.l2(`/data/order/${encodeURIComponent(orderId)}`)
  }

  /** Your trades; filter by market/asset and pagination cursor. */
  async getTrades(params: {
    market?: string
    assetId?: string
    before?: number
    after?: number
  } = {}): Promise<unknown> {
    return this.l2('/data/trades', {
      query: { market: params.market, asset_id: params.assetId, before: params.before, after: params.after },
    })
  }

  async cancelOrder(orderId: string): Promise<unknown> {
    const { body, headers } = jsonBody({ orderID: orderId })
    return this.l2('/order', { method: 'DELETE', body, headers })
  }

  async cancelOrders(orderIds: string[]): Promise<unknown> {
    const { body, headers } = jsonBody(orderIds)
    return this.l2('/orders', { method: 'DELETE', body, headers })
  }

  async cancelAllOrders(): Promise<unknown> {
    return this.l2('/cancel-all', { method: 'DELETE' })
  }

  /** Cancel all open orders for one (market, asset) pair. Both fields are required by the API. */
  async cancelMarketOrders(marketConditionId: string, assetId: string): Promise<unknown> {
    const { body, headers } = jsonBody({ market: marketConditionId, asset_id: assetId })
    return this.l2('/cancel-market-orders', { method: 'DELETE', body, headers })
  }

  /**
   * Trading heartbeat. While trading, send at least every ~5s; a lapse of
   * >10s cancels all your open orders. First call passes ''.
   */
  async sendHeartbeat(heartbeatId: string): Promise<{ heartbeat_id: string; [key: string]: unknown }> {
    const { body, headers } = jsonBody({ heartbeat_id: heartbeatId })
    try {
      // Current spec declares POST /v1/heartbeats with a HeartbeatRequest body.
      return await this.l2('/v1/heartbeats', { method: 'POST', body, headers })
    } catch (error) {
      // Legacy deployments expose the bodyless-era /heartbeats route instead.
      if (error instanceof PolymarketHttpError && (error.status === 404 || error.status === 405)) {
        return this.l2('/heartbeats', { method: 'POST', body, headers }) as Promise<{ heartbeat_id: string; [key: string]: unknown }>
      }
      throw error
    }
  }

  /**
   * Collateral/conditional balance and allowance for the funder address.
   * Protocol V2 positions use `CONDITIONAL-V2`; legacy CTF positions keep
   * `CONDITIONAL`; pUSD collateral is `COLLATERAL`.
   */
  async getBalanceAllowance(assetType: 'COLLATERAL' | 'CONDITIONAL' | 'CONDITIONAL-V2', tokenId?: string): Promise<unknown> {
    return this.l2('/balance-allowance', {
      query: { asset_type: assetType, token_id: tokenId, signature_type: this.credentials?.signatureType },
    })
  }

  /** List all API keys on the account. */
  async getApiKeys(): Promise<unknown> {
    return this.l2('/auth/api-keys')
  }

  /** Whether the account is restricted to close-only mode. */
  async getBanStatus(): Promise<unknown> {
    return this.l2('/auth/ban-status/closed-only')
  }

  async getNotifications(): Promise<unknown> {
    return this.l2('/notifications', { query: { signature_type: this.credentials?.signatureType } })
  }
}
