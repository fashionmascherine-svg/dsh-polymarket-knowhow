/**
 * Client for Polymarket Perps — perpetual futures (NEW API surface).
 *
 * Base URL: https://api.perpetuals.polymarket.com
 * Auth (account/trade groups): `POLYMARKET-PROXY` (proxy address) and
 * `POLYMARKET-SECRET` headers. `/v1/info/*` endpoints are public.
 *
 * WebSocket: wss://ws.perpetuals.polymarket.com (~27 channels) is documented
 * in knowledge/perps.md but not bridged by this plugin yet.
 */
import { requestJson, jsonBody, type HttpConfig, type RequestOptions } from './http.js'

export interface PerpsCredentials {
  proxy: string
  secret: string
}

/** Options accepted by the authenticated request helper. */
type RequestBodyOptions = Omit<RequestOptions, 'headers'> & { headers?: Record<string, string> }

/** Interval enum accepted by /v1/info/klines and /v1/info/mark-history (live-verified). */
export type PerpsInterval = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '6h' | '12h' | '1d' | '1w'

export class PerpsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
    private credentials?: PerpsCredentials,
  ) {}

  setCredentials(creds: PerpsCredentials): void {
    this.credentials = creds
  }

  hasCredentials(): boolean {
    return this.credentials !== undefined
  }

  private async info<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    const url = this.baseUrl.replace(/\/+$/, '') + path
    return requestJson<T>(url, { query }, this.http)
  }

  private async authed<T>(path: string, options: RequestBodyOptions = {}): Promise<T> {
    if (this.credentials === undefined) {
      throw new Error('This Perps operation requires credentials (configure perps.proxy/secret or POLYMARKET_PROXY/POLYMARKET_SECRET environment variables)')
    }
    const search = new URLSearchParams()
    if (options.query !== undefined) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue
        for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item))
      }
    }
    const encoded = search.toString()
    const pathWithQuery = encoded.length === 0 ? path : path + '?' + encoded
    const url = this.baseUrl.replace(/\/+$/, '') + pathWithQuery
    return requestJson<T>(url, {
      ...options,
      query: undefined,
      headers: {
        'POLYMARKET-PROXY': this.credentials.proxy,
        'POLYMARKET-SECRET': this.credentials.secret,
      },
    }, this.http)
  }

  // ── Public market info (/v1/info/*) ────────────────────────────────────

  ping(): Promise<unknown> { return this.info('/v1/info/ping') }
  serverTime(): Promise<unknown> { return this.info('/v1/info/time') }
  exchangeInfo(): Promise<unknown> { return this.info('/v1/info/exchange') }
  collateralAssets(): Promise<unknown> { return this.info('/v1/info/assets') }
  /**
   * Numeric perps instrument identifier (see `instruments()`), e.g. `1` for
   * SP500-USD. Live-verified: the API rejects symbolic ids on /v1/info/*.
   */
  instruments(params: { instrument_id?: number } = {}): Promise<unknown> {
    return this.info('/v1/info/instruments', { instrument_id: params.instrument_id })
  }
  tickers(params: { instrument_id?: number } = {}): Promise<unknown> {
    return this.info('/v1/info/tickers', { instrument_id: params.instrument_id })
  }
  bestBidOffer(params: { instrument_id: number }): Promise<unknown> {
    return this.info('/v1/info/bbo', { instrument_id: params.instrument_id })
  }
  book(params: { instrument_id: number; depth?: number }): Promise<unknown> {
    return this.info('/v1/info/book', { instrument_id: params.instrument_id, depth: params.depth })
  }
  /** Kline `interval` enum (live-verified): 1s|1m|5m|15m|30m|1h|4h|6h|12h|1d|1w. Timestamps are epoch milliseconds. */
  klines(params: { instrument_id: number; interval: PerpsInterval; start_timestamp: number; end_timestamp?: number }): Promise<unknown> {
    return this.info('/v1/info/klines', {
      instrument_id: params.instrument_id,
      interval: params.interval,
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
    })
  }
  markPriceHistory(params: { instrument_id: number; interval: PerpsInterval; start_timestamp: number; end_timestamp?: number }): Promise<unknown> {
    return this.info('/v1/info/mark-history', {
      instrument_id: params.instrument_id,
      interval: params.interval,
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
    })
  }
  index(params: { asset: string }): Promise<unknown> {
    return this.info('/v1/info/index', { asset: params.asset })
  }
  recentTrades(params: { instrument_id: number; start_timestamp?: number; end_timestamp?: number }): Promise<unknown> {
    return this.info('/v1/info/trades', {
      instrument_id: params.instrument_id,
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
    })
  }
  publicPortfolio(address: string): Promise<unknown> {
    return this.info('/v1/info/portfolio', { address })
  }
  fundingHistory(params: { instrument_id: number; start_timestamp?: number; end_timestamp?: number }): Promise<unknown> {
    return this.info('/v1/info/funding', {
      instrument_id: params.instrument_id,
      start_timestamp: params.start_timestamp,
      end_timestamp: params.end_timestamp,
    })
  }
  fees(): Promise<unknown> { return this.info('/v1/info/fees') }
  statistics(params: { instrument_id?: number } = {}): Promise<unknown> {
    return this.info('/v1/info/statistics', { instrument_id: params.instrument_id })
  }

  // ── Account (/v1/account/*, authed) ────────────────────────────────────

  balances(): Promise<unknown> { return this.authed('/v1/account/balances') }
  accountPortfolio(): Promise<unknown> { return this.authed('/v1/account/portfolio') }
  fills(): Promise<unknown> { return this.authed('/v1/account/fills') }
  openOrders(): Promise<unknown> { return this.authed('/v1/account/open-orders') }
  ordersHistory(): Promise<unknown> { return this.authed('/v1/account/orders') }
  pnl(): Promise<unknown> { return this.authed('/v1/account/pnl') }
  fundingPayments(): Promise<unknown> { return this.authed('/v1/account/funding') }
  deposits(): Promise<unknown> { return this.authed('/v1/account/deposits') }
  withdrawals(): Promise<unknown> { return this.authed('/v1/account/withdrawals') }
  limits(): Promise<unknown> { return this.authed('/v1/account/limits') }
  rewards(): Promise<unknown> { return this.authed('/v1/account/rewards') }
  stats(): Promise<unknown> { return this.authed('/v1/account/stats') }

  // ── Trading (/v1/trade/*, authed) ──────────────────────────────────────

  /** Create orders. Payload shape follows `POST /v1/trade/orders`; pass through as-is. */
  createOrders(payload: unknown): Promise<unknown> {
    const { body, headers } = jsonBody(payload)
    return this.authed('/v1/trade/orders', { method: 'POST', body, headers })
  }

  cancelOrder(payload: unknown): Promise<unknown> {
    const { body, headers } = jsonBody(payload)
    return this.authed('/v1/trade/orders', { method: 'DELETE', body, headers })
  }

  cancelOrderByClientOrderId(payload: unknown): Promise<unknown> {
    const { body, headers } = jsonBody(payload)
    return this.authed('/v1/trade/orders-coid', { method: 'DELETE', body, headers })
  }

  cancelAllOrders(): Promise<unknown> {
    return this.authed('/v1/trade/orders/all', { method: 'DELETE' })
  }

  setLeverage(payload: unknown): Promise<unknown> {
    const { body, headers } = jsonBody(payload)
    return this.authed('/v1/trade/leverage', { method: 'PATCH', body, headers })
  }
}
