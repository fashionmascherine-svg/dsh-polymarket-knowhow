/**
 * Client for the Polymarket Gamma (Markets) API — events, markets, tags,
 * search, series and sports metadata. No authentication required.
 *
 * Endpoint set verified against `gamma-openapi.yaml` and live responses.
 * NOTE: sort fields are camelCase WITHOUT underscores (`volume24hr`, not
 * `volume_24hr`); underscore variants are rejected with HTTP 422.
 */
import { requestJson, type HttpConfig, type RequestOptions } from './http.js'

export interface GammaMarket {
  id: string
  question?: string
  conditionId?: string
  slug?: string
  description?: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  clobTokenIds?: string | string[]
  volume?: number | string
  volume24hr?: number | string
  liquidity?: number | string
  active?: boolean
  closed?: boolean
  acceptingOrders?: boolean
  negRisk?: boolean
  orderPriceMinTickSize?: number | string
  orderMinSize?: number | string
  bestBid?: number
  bestAsk?: number
  lastTradePrice?: number
  spread?: number
  endDate?: string
  startDate?: string
  events?: GammaEvent[]
  [key: string]: unknown
}

export interface GammaEvent {
  id: string
  ticker?: string
  slug?: string
  title?: string
  description?: string
  startDate?: string
  endDate?: string
  active?: boolean
  closed?: boolean
  archived?: boolean
  liquidity?: number | string
  volume?: number | string
  volume24hr?: number | string
  openInterest?: number | string
  markets?: GammaMarket[]
  tags?: GammaTag[]
  [key: string]: unknown
}

export interface GammaTag {
  id: string
  label?: string
  slug?: string
  [key: string]: unknown
}

/** Sort fields accepted by `/events` and `/events/keyset` (live-verified). */
export const EVENT_ORDER_FIELDS = [
  'volume24hr', 'volume', 'liquidity', 'startDate', 'endDate',
  'competitive', 'closedTime', 'commentCount', 'newMarkets',
] as const

/** Extra sort fields only valid on `/markets`. */
export const MARKET_ORDER_FIELDS = [...EVENT_ORDER_FIELDS, 'spread', 'lastTradePrice', 'bestBid', 'bestAsk'] as const

export interface ListParams {
  limit?: number
  offset?: number
  order?: string
  ascending?: boolean
  active?: boolean
  closed?: boolean
  archived?: boolean
  tagId?: string | string[]
  slug?: string
  seriesId?: string | string[]
  liquidityMin?: number
  volumeMin?: number
}

export interface KeysetParams extends Omit<ListParams, 'offset'> {
  afterCursor?: string
  live?: boolean
  titleSearch?: string
}

export class GammaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
  ) {}

  private request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>(this.baseUrl + path, options, this.http)
  }

  async listEvents(params: ListParams = {}): Promise<GammaEvent[]> {
    return this.request('/events', {
      query: {
        limit: params.limit,
        offset: params.offset,
        order: params.order,
        ascending: params.ascending,
        active: params.active,
        closed: params.closed,
        archived: params.archived,
        tag_id: params.tagId,
        slug: params.slug,
        series_id: params.seriesId,
        liquidity_min: params.liquidityMin,
        volume_min: params.volumeMin,
      },
    })
  }

  /** Cursor-paginated event listing; supports up to 500 per page. */
  async listEventsKeyset(params: KeysetParams = {}): Promise<{ data?: GammaEvent[]; cursor?: string; [key: string]: unknown }> {
    return this.request('/events/keyset', {
      query: {
        limit: params.limit,
        order: params.order,
        ascending: params.ascending,
        after_cursor: params.afterCursor,
        active: params.active,
        closed: params.closed,
        live: params.live,
        title_search: params.titleSearch,
        tag_id: params.tagId,
        series_id: params.seriesId,
        liquidity_min: params.liquidityMin,
        volume_min: params.volumeMin,
      },
    })
  }

  async getEvent(id: string): Promise<GammaEvent> {
    return this.request(`/events/${encodeURIComponent(id)}`)
  }

  async getEventBySlug(slug: string): Promise<GammaEvent[]> {
    return this.request(`/events`, { query: { slug } })
  }

  async getEventTags(id: string): Promise<GammaTag[]> {
    return this.request(`/events/${encodeURIComponent(id)}/tags`)
  }

  async listMarkets(params: ListParams = {}): Promise<GammaMarket[]> {
    return this.request('/markets', {
      query: {
        limit: params.limit,
        offset: params.offset,
        order: params.order,
        ascending: params.ascending,
        active: params.active,
        closed: params.closed,
        archived: params.archived,
        tag_id: params.tagId,
        slug: params.slug,
        liquidity_min: params.liquidityMin,
        volume_min: params.volumeMin,
      },
    })
  }

  async listMarketsByIds(params: {
    conditionIds?: string[]
    clobTokenIds?: string[]
    limit?: number
    offset?: number
  }): Promise<GammaMarket[]> {
    return this.request('/markets', {
      query: {
        condition_ids: params.conditionIds,
        clob_token_ids: params.clobTokenIds,
        limit: params.limit,
        offset: params.offset,
      },
    })
  }

  /** Cursor-paginated market listing; supports up to 100 per page. */
  async listMarketsKeyset(params: KeysetParams = {}): Promise<{ data?: GammaMarket[]; cursor?: string; [key: string]: unknown }> {
    return this.request('/markets/keyset', {
      query: {
        limit: params.limit,
        order: params.order,
        ascending: params.ascending,
        after_cursor: params.afterCursor,
        active: params.active,
        closed: params.closed,
        title_search: params.titleSearch,
        tag_id: params.tagId,
        decimalized: true,
      },
    })
  }

  async getMarket(id: string): Promise<GammaMarket> {
    return this.request(`/markets/${encodeURIComponent(id)}`)
  }

  async getMarketBySlug(slug: string): Promise<GammaMarket> {
    return this.request(`/markets/slug/${encodeURIComponent(slug)}`)
  }

  /** Search markets, events and profiles (`GET /public-search`). */
  async search(params: {
    q: string
    eventsStatus?: 'active' | 'closed'
    limitPerType?: number
    page?: number
  }): Promise<Record<string, unknown>> {
    return this.request('/public-search', {
      query: {
        q: params.q,
        events_status: params.eventsStatus,
        limit_per_type: params.limitPerType,
        page: params.page,
      },
    })
  }

  async listTags(params: { limit?: number; offset?: number } = {}): Promise<GammaTag[]> {
    return this.request('/tags', { query: params })
  }

  async getTag(id: string): Promise<GammaTag> {
    return this.request(`/tags/${encodeURIComponent(id)}`)
  }

  async getRelatedTags(idOrSlug: string, bySlug = false): Promise<unknown> {
    if (bySlug) return this.request(`/tags/slug/${encodeURIComponent(idOrSlug)}/related-tags/tags`)
    return this.request(`/tags/${encodeURIComponent(idOrSlug)}/related-tags/tags`)
  }

  async sportsMetadata(): Promise<unknown> {
    return this.request('/sports')
  }

  async sportsMarketTypes(): Promise<unknown> {
    return this.request('/sports/market-types')
  }

  async getSeries(id: string): Promise<unknown> {
    return this.request(`/series/${encodeURIComponent(id)}`)
  }

  async status(): Promise<unknown> {
    return this.request('/status')
  }
}
