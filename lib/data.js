/**
 * Client for the Polymarket Data API — positions, trades, activity, holders,
 * leaderboards, open interest and portfolio value. No auth for these reads.
 *
 * Endpoint set verified against `data-openapi.yaml` and live responses.
 * Notable parameter shapes (live-verified):
 * - `/live-volume` takes `id` (the event id), not `event`.
 * - `/holders` requires the full 32-byte market (condition) id.
 */
import { requestJson } from './http.js';
export class DataApiClient {
    baseUrl;
    http;
    constructor(baseUrl, http) {
        this.baseUrl = baseUrl;
        this.http = http;
    }
    request(path, options = {}) {
        return requestJson(this.baseUrl + path, options, this.http);
    }
    /** Current ERC1155 positions for a wallet (`user` required). */
    async positions(params) {
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
        });
    }
    /** Positions that already resolved (`GET /closed-positions`). */
    async closedPositions(params) {
        return this.request('/closed-positions', {
            query: { user: params.user.toLowerCase(), limit: params.limit, offset: params.offset, sortBy: params.sortBy },
        });
    }
    /** Public trades filtered by user and/or market. */
    async trades(params) {
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
        });
    }
    /** On-chain user activity (trades, splits, merges, redemptions…). */
    async activity(params) {
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
        });
    }
    /** Top holders for one or more markets (full condition ids). */
    async holders(params) {
        const markets = Array.isArray(params.market) ? params.market : [params.market];
        const results = await Promise.all(markets.map((market) => this.request('/holders', { query: { market: market.toLowerCase(), limit: params.limit ?? 10 } })));
        return markets.length === 1 ? results[0] : results;
    }
    /**
     * Trader leaderboard rankings. The official spec param is `timePeriod`
     * (DAY|WEEK|MONTH|ALL); production also tolerates the legacy `window`
     * spelling (live-verified both return 200 on /v1/leaderboard).
     */
    async leaderboard(params = {}) {
        return this.request('/v1/leaderboard', { query: { timePeriod: (params.timePeriod ?? 'ALL').toUpperCase(), limit: params.limit } });
    }
    /** Open interest; pass either `global: true`, a market (condition id), slug, or event id. */
    async openInterest(params) {
        if (params.global === true)
            return this.request('/oi', { query: { global: true } });
        if (params.market !== undefined)
            return this.request('/oi', { query: { market: params.market.toLowerCase() } });
        if (params.slug !== undefined)
            return this.request('/oi', { query: { slug: params.slug } });
        if (params.eventId !== undefined)
            return this.request('/oi', { query: { event: params.eventId } });
        throw new Error('openInterest requires one of global/market/slug/eventId');
    }
    /** Live (in-game) volume for an event id. */
    async liveVolume(eventId) {
        return this.request('/live-volume', { query: { id: eventId } });
    }
    /** Total value of a user's positions in USD. */
    async value(user) {
        return this.request('/value', { query: { user: user.toLowerCase() } });
    }
    /** Number of distinct markets a user has traded. */
    async traded(user) {
        return this.request('/traded', { query: { user: user.toLowerCase() } });
    }
    /** Positions of all users for one market (`GET /v1/market-positions`). */
    async marketPositions(params) {
        return this.request('/v1/market-positions', { query: { market: params.market.toLowerCase(), limit: params.limit } });
    }
    /** "Other" share size for augmented neg-risk events (`id` = event id). */
    async otherSize(params) {
        return this.request('/other', { query: { id: params.eventId, user: params.user?.toLowerCase() } });
    }
}
