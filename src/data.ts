/**
 * Client for the Polymarket Data API — positions, trades, activity, holders,
 * leaderboards, open interest and portfolio value. No auth for these reads.
 *
 * Endpoint set verified against `data-openapi.yaml` and live responses.
 * Notable parameter shapes (live-verified):
 * - `/live-volume` takes `id` (the event id), not `event`.
 * - `/holders` requires the full 32-byte market (condition) id.
 */
import { requestJson, type HttpConfig, type RequestOptions } from './http.js'

export interface DataPosition {
  proxyWallet?: string
  asset?: string
  conditionId?: string
  size?: number
  avgPrice?: number
  initialValue?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  totalBought?: number
  realizedPnl?: number
  curPrice?: number
  redeemable?: boolean
  mergeable?: boolean
  title?: string
  slug?: string
  outcome?: string
  endDate?: string
  negativeRisk?: boolean
  [key: string]: unknown
}

export interface DataTrade {
  proxyWallet?: string
  side?: 'BUY' | 'SELL'
  asset?: string
  conditionId?: string
  size?: number
  price?: number
  outcome?: string
  outcomeIndex?: number
  timestamp?: number
  title?: string
  slug?: string
  transactionHash?: string
  pseudonym?: string
  name?: string
  [key: string]: unknown
}

export class DataApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
  ) {}

  private request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>(this.baseUrl + path, options, this.http)
  }

  /** Current ERC1155 positions for a wallet (`user` required). */
  async positions(params: {
    user: string
    market?: string | string[]
    sizeThreshold?: number
    redeemable?: boolean
    mergeable?: boolean
    limit?: number
    offset?: number
    sortBy?: 'CURRENT' | 'CASH' | 'TIME' | 'CASHPNL' | 'PERCENTPNL'
    sortDirection?: 'ASC' | 'DESC'
  }): Promise<DataPosition[]> {
    return this.request('/positions', {
      query: {
        user: params.user.toLowerCase(),
        market: params.market,
        sizeThreshold: params.sizeThreshold,
        redeemable: params.redeemable,
        mergeable: params.mergeable,
        limit: params.limit,
        offset: params.offset,
        sortBy: params.sortBy,
        sortDirection: params.sortDirection,
      },
    })
  }

  /** Positions that already resolved (`GET /closed-positions`). */
  async closedPositions(params: { user: string; limit?: number; offset?: number; sortBy?: string }): Promise<unknown> {
    return this.request('/closed-positions', {
      query: { user: params.user.toLowerCase(), limit: params.limit, offset: params.offset, sortBy: params.sortBy },
    })
  }

  /** Public trades filtered by user and/or market. */
  async trades(params: {
    user?: string
    market?: string | string[]
    limit?: number
    offset?: number
    takerOnly?: boolean
    filterType?: 'CASH' | 'TOKENS'
    filterAmount?: number
    side?: 'BUY' | 'SELL'
  }): Promise<DataTrade[]> {
    return this.request('/trades', {
      query: {
        user: params.user?.toLowerCase(),
        market: params.market,
        limit: params.limit,
        offset: params.offset,
        takerOnly: params.takerOnly,
        filterType: params.filterType,
        filterAmount: params.filterAmount,
        side: params.side,
      },
    })
  }

  /** On-chain user activity (trades, splits, merges, redemptions…). */
  async activity(params: {
    user: string
    limit?: number
    offset?: number
    type?: string[]
    start?: number
    end?: number
    side?: 'BUY' | 'SELL'
    conditionId?: string
  }): Promise<unknown> {
    return this.request('/activity', {
      query: {
        user: params.user.toLowerCase(),
        limit: params.limit,
        offset: params.offset,
        type: params.type,
        start: params.start,
        end: params.end,
        side: params.side,
        market: params.conditionId,
      },
    })
  }

  /** Top holders for one or more markets (full condition ids). */
  async holders(params: { market: string | string[]; limit?: number }): Promise<unknown> {
    const markets = Array.isArray(params.market) ? params.market : [params.market]
    const results = await Promise.all(markets.map((market) =>
      this.request('/holders', { query: { market: market.toLowerCase(), limit: params.limit ?? 10 } }),
    ))
    return markets.length === 1 ? results[0] : results
  }

  /**
   * Trader leaderboard rankings. The official spec param is `timePeriod`
   * (DAY|WEEK|MONTH|ALL); production also tolerates the legacy `window`
   * spelling (live-verified both return 200 on /v1/leaderboard).
   */
  async leaderboard(params: { timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL'; limit?: number } = {}): Promise<unknown> {
    return this.request('/v1/leaderboard', { query: { timePeriod: (params.timePeriod ?? 'ALL').toUpperCase(), limit: params.limit } })
  }

  /** Open interest; pass either `global: true`, a market (condition id), slug, or event id. */
  async openInterest(params: { global?: boolean; market?: string; slug?: string; eventId?: string }): Promise<unknown> {
    if (params.global === true) return this.request('/oi', { query: { global: true } })
    if (params.market !== undefined) return this.request('/oi', { query: { market: params.market.toLowerCase() } })
    if (params.slug !== undefined) return this.request('/oi', { query: { slug: params.slug } })
    if (params.eventId !== undefined) return this.request('/oi', { query: { event: params.eventId } })
    throw new Error('openInterest requires one of global/market/slug/eventId')
  }

  /** Live (in-game) volume for an event id. */
  async liveVolume(eventId: string): Promise<unknown> {
    return this.request('/live-volume', { query: { id: eventId } })
  }

  /** Total value of a user's positions in USD. */
  async value(user: string): Promise<Array<{ user: string; value: number }>> {
    return this.request('/value', { query: { user: user.toLowerCase() } })
  }

  /** Number of distinct markets a user has traded. */
  async traded(user: string): Promise<unknown> {
    return this.request('/traded', { query: { user: user.toLowerCase() } })
  }

  /** Positions of all users for one market (`GET /v1/market-positions`). */
  async marketPositions(params: { market: string; limit?: number }): Promise<unknown> {
    return this.request('/v1/market-positions', { query: { market: params.market.toLowerCase(), limit: params.limit } })
  }

  /** "Other" share size for augmented neg-risk events (`id` = event id). */
  async otherSize(params: { eventId: string; user?: string }): Promise<unknown> {
    return this.request('/other', { query: { id: params.eventId, user: params.user?.toLowerCase() } })
  }
}
