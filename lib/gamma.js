/**
 * Client for the Polymarket Gamma (Markets) API — events, markets, tags,
 * search, series and sports metadata. No authentication required.
 *
 * Endpoint set verified against `gamma-openapi.yaml` and live responses.
 * NOTE: sort fields are camelCase WITHOUT underscores (`volume24hr`, not
 * `volume_24hr`); underscore variants are rejected with HTTP 422.
 */
import { requestJson } from './http.js';
/** Sort fields accepted by `/events` and `/events/keyset` (live-verified). */
export const EVENT_ORDER_FIELDS = [
    'volume24hr', 'volume', 'liquidity', 'startDate', 'endDate',
    'competitive', 'closedTime', 'commentCount', 'newMarkets',
];
/** Extra sort fields only valid on `/markets`. */
export const MARKET_ORDER_FIELDS = [...EVENT_ORDER_FIELDS, 'spread', 'lastTradePrice', 'bestBid', 'bestAsk'];
export class GammaClient {
    baseUrl;
    http;
    constructor(baseUrl, http) {
        this.baseUrl = baseUrl;
        this.http = http;
    }
    request(path, options = {}) {
        return requestJson(this.baseUrl + path, options, this.http);
    }
    async listEvents(params = {}) {
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
        });
    }
    /** Cursor-paginated event listing; supports up to 500 per page. */
    async listEventsKeyset(params = {}) {
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
        });
    }
    async getEvent(id) {
        return this.request(`/events/${encodeURIComponent(id)}`);
    }
    async getEventBySlug(slug) {
        return this.request(`/events`, { query: { slug } });
    }
    async getEventTags(id) {
        return this.request(`/events/${encodeURIComponent(id)}/tags`);
    }
    async listMarkets(params = {}) {
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
        });
    }
    async listMarketsByIds(params) {
        return this.request('/markets', {
            query: {
                condition_ids: params.conditionIds,
                clob_token_ids: params.clobTokenIds,
                closed: params.closed,
                limit: params.limit,
                offset: params.offset,
            },
        });
    }
    /** Cursor-paginated market listing; supports up to 100 per page. */
    async listMarketsKeyset(params = {}) {
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
        });
    }
    async getMarket(id) {
        return this.request(`/markets/${encodeURIComponent(id)}`);
    }
    async getMarketBySlug(slug) {
        return this.request(`/markets/slug/${encodeURIComponent(slug)}`);
    }
    /** Search markets, events and profiles (`GET /public-search`). */
    async search(params) {
        return this.request('/public-search', {
            query: {
                q: params.q,
                events_status: params.eventsStatus,
                limit_per_type: params.limitPerType,
                page: params.page,
            },
        });
    }
    async listTags(params = {}) {
        return this.request('/tags', { query: params });
    }
    async getTag(id) {
        return this.request(`/tags/${encodeURIComponent(id)}`);
    }
    async getRelatedTags(idOrSlug, bySlug = false) {
        if (bySlug)
            return this.request(`/tags/slug/${encodeURIComponent(idOrSlug)}/related-tags/tags`);
        return this.request(`/tags/${encodeURIComponent(idOrSlug)}/related-tags/tags`);
    }
    async sportsMetadata() {
        return this.request('/sports');
    }
    async sportsMarketTypes() {
        return this.request('/sports/market-types');
    }
    async getSeries(id) {
        return this.request(`/series/${encodeURIComponent(id)}`);
    }
    async status() {
        return this.request('/status');
    }
}
