/**
 * Client for the Polymarket Gamma (Markets) API — events, markets, tags,
 * search, series and sports metadata. No authentication required.
 *
 * Endpoint set verified against `gamma-openapi.yaml` and live responses.
 * NOTE: sort fields are camelCase WITHOUT underscores (`volume24hr`, not
 * `volume_24hr`); underscore variants are rejected with HTTP 422.
 */
import { type HttpConfig } from './http.js';
export interface GammaMarket {
    id: string;
    question?: string;
    conditionId?: string;
    slug?: string;
    description?: string;
    outcomes?: string | string[];
    outcomePrices?: string | string[];
    clobTokenIds?: string | string[];
    volume?: number | string;
    volume24hr?: number | string;
    liquidity?: number | string;
    active?: boolean;
    closed?: boolean;
    acceptingOrders?: boolean;
    negRisk?: boolean;
    orderPriceMinTickSize?: number | string;
    orderMinSize?: number | string;
    bestBid?: number;
    bestAsk?: number;
    lastTradePrice?: number;
    spread?: number;
    endDate?: string;
    startDate?: string;
    events?: GammaEvent[];
    [key: string]: unknown;
}
export interface GammaEvent {
    id: string;
    ticker?: string;
    slug?: string;
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    liquidity?: number | string;
    volume?: number | string;
    volume24hr?: number | string;
    openInterest?: number | string;
    markets?: GammaMarket[];
    tags?: GammaTag[];
    [key: string]: unknown;
}
export interface GammaTag {
    id: string;
    label?: string;
    slug?: string;
    [key: string]: unknown;
}
/** Sort fields accepted by `/events` and `/events/keyset` (live-verified). */
export declare const EVENT_ORDER_FIELDS: readonly ["volume24hr", "volume", "liquidity", "startDate", "endDate", "competitive", "closedTime", "commentCount", "newMarkets"];
/** Extra sort fields only valid on `/markets`. */
export declare const MARKET_ORDER_FIELDS: readonly ["volume24hr", "volume", "liquidity", "startDate", "endDate", "competitive", "closedTime", "commentCount", "newMarkets", "spread", "lastTradePrice", "bestBid", "bestAsk"];
export interface ListParams {
    limit?: number;
    offset?: number;
    order?: string;
    ascending?: boolean;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
    tagId?: string | string[];
    slug?: string;
    seriesId?: string | string[];
    liquidityMin?: number;
    volumeMin?: number;
}
export interface KeysetParams extends Omit<ListParams, 'offset'> {
    afterCursor?: string;
    live?: boolean;
    titleSearch?: string;
}
export declare class GammaClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    private request;
    listEvents(params?: ListParams): Promise<GammaEvent[]>;
    /** Cursor-paginated event listing; supports up to 500 per page. */
    listEventsKeyset(params?: KeysetParams): Promise<{
        data?: GammaEvent[];
        cursor?: string;
        [key: string]: unknown;
    }>;
    getEvent(id: string): Promise<GammaEvent>;
    getEventBySlug(slug: string): Promise<GammaEvent[]>;
    getEventTags(id: string): Promise<GammaTag[]>;
    listMarkets(params?: ListParams): Promise<GammaMarket[]>;
    listMarketsByIds(params: {
        conditionIds?: string[];
        clobTokenIds?: string[];
        limit?: number;
        offset?: number;
    }): Promise<GammaMarket[]>;
    /** Cursor-paginated market listing; supports up to 100 per page. */
    listMarketsKeyset(params?: KeysetParams): Promise<{
        data?: GammaMarket[];
        cursor?: string;
        [key: string]: unknown;
    }>;
    getMarket(id: string): Promise<GammaMarket>;
    getMarketBySlug(slug: string): Promise<GammaMarket>;
    /** Search markets, events and profiles (`GET /public-search`). */
    search(params: {
        q: string;
        eventsStatus?: 'active' | 'closed';
        limitPerType?: number;
        page?: number;
    }): Promise<Record<string, unknown>>;
    listTags(params?: {
        limit?: number;
        offset?: number;
    }): Promise<GammaTag[]>;
    getTag(id: string): Promise<GammaTag>;
    getRelatedTags(idOrSlug: string, bySlug?: boolean): Promise<unknown>;
    sportsMetadata(): Promise<unknown>;
    sportsMarketTypes(): Promise<unknown>;
    getSeries(id: string): Promise<unknown>;
    status(): Promise<unknown>;
}
