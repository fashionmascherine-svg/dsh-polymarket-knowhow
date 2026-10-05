/**
 * Client for the Polymarket Data API v2 — positions, trades, activity,
 * holders, leaderboards, open interest and portfolio value. No auth for
 * these reads.
 *
 * On the /v2 routes (Data API v1 retires on 2026-10-24):
 * - every response uses the v2 envelope `{ data, pagination? }`; a miss is
 *   `data: null` or an empty list, never an error
 * - pagination is cursor-only: pass `cursor`, follow `pagination.next_cursor`
 *   (`offset` is rejected by v2 routes)
 * - fields are snake_case; market selection is `condition` (aliases
 *   `condition_id`/`conditionId`; max 20 comma-joined ids)
 * - position lifecycle: `status` OPEN|REDEEMABLE|REDEEMABLE_LOST|MERGEABLE|CLOSED
 *   and every row carries `redeemable`/`mergeable` flags
 *
 * Shapes live-verified against production (2026-10-05). `/other` and
 * `/revisions` have no v2 counterpart and are gone; `/v1/accounting/snapshot`
 * is the only v1 route that stays (documented exception).
 */
import { requestJson } from './http.js';
/** Max condition ids accepted by v2 `condition` (comma-joined). */
const MAX_CONDITIONS = 20;
function joinConditions(condition) {
    if (condition === undefined)
        return undefined;
    const list = (Array.isArray(condition) ? condition : [condition]).map((c) => c.trim()).filter((c) => c.length > 0);
    if (list.length === 0)
        return undefined;
    return list.slice(0, MAX_CONDITIONS).join(',');
}
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
    /** Positions for a wallet and/or market (`user` and `condition` both optional). */
    async positions(params) {
        return this.request('/v2/positions', {
            query: {
                user: params.user?.toLowerCase(),
                condition: joinConditions(params.condition),
                status: params.status,
                size_threshold: params.sizeThreshold,
                redeemable: params.redeemable,
                mergeable: params.mergeable,
                archived: params.archived,
                sort_by: params.sortBy,
                sort_direction: params.sortDirection,
                limit: params.limit,
                cursor: params.cursor,
            },
        });
    }
    /** Positions that already resolved (v1 `/closed-positions` → `status=CLOSED`). */
    async closedPositions(params) {
        return this.positions({ user: params.user, status: 'CLOSED', limit: params.limit, cursor: params.cursor });
    }
    /** Positions of all users for one market (v1 `/v1/market-positions` → `condition`). */
    async marketPositions(params) {
        return this.positions({ condition: params.condition, limit: params.limit, cursor: params.cursor });
    }
    /** Public trades filtered by user and/or market. */
    async trades(params) {
        return this.request('/v2/trades', {
            query: {
                user: params.user?.toLowerCase(),
                condition: joinConditions(params.condition),
                limit: params.limit,
                cursor: params.cursor,
                taker_only: params.takerOnly,
                filter_type: params.filterType,
                filter_amount: params.filterAmount,
                side: params.side,
            },
        });
    }
    /**
     * On-chain user activity (trades, splits, merges, redemptions…).
     *
     * Production constraint (live-verified 2026-10-05): /v2/activity accepts
     * exactly ONE `type` value per request — the plain single value is the only
     * form that actually filters. Repeated keys fail with 400 "duplicate field
     * `type`" and the bracket/CSV alternate forms return 200 with the filter
     * silently ignored, so a multi-type array is rejected here instead of
     * silently returning unfiltered data; issue one call per type.
     */
    async activity(params) {
        const types = params.type?.filter((t) => t.length > 0) ?? [];
        if (types.length > 1) {
            throw new Error('Polymarket /v2/activity accepts a single `type` per request (multi-type arrays are rejected or silently unfiltered); issue one call per type');
        }
        return this.request('/v2/activity', {
            query: {
                user: params.user.toLowerCase(),
                limit: params.limit,
                cursor: params.cursor,
                type: types[0],
                start: params.start,
                end: params.end,
                side: params.side,
                condition: params.conditionId?.toLowerCase(),
            },
        });
    }
    /** Top holders for one or more markets (full condition ids; v2 param is `condition`). */
    async holders(params) {
        const conditions = Array.isArray(params.condition) ? params.condition : [params.condition];
        const results = await Promise.all(conditions.map((condition) => this.request('/v2/holders', {
            query: {
                condition: condition.toLowerCase(),
                limit: params.limit ?? 10,
                include_pnl: params.includePnl,
            },
        })));
        return conditions.length === 1 ? (results[0] ?? { data: null }) : results;
    }
    /**
     * Trader leaderboard rankings (v2 `/v2/leaderboard`, param `time_period`).
     * Rows carry `rank`, `user_id`, `pnl`, `volume`, `user_name`.
     */
    async leaderboard(params = {}) {
        return this.request('/v2/leaderboard', {
            query: { time_period: (params.timePeriod ?? 'ALL').toUpperCase(), limit: params.limit, cursor: params.cursor },
        });
    }
    /** Open interest; pass either `global: true`, a condition id, slug, or event id. */
    async openInterest(params) {
        if (params.global === true)
            return this.request('/v2/oi', { query: { global: true } });
        if (params.condition !== undefined)
            return this.request('/v2/oi', { query: { condition: params.condition.toLowerCase() } });
        if (params.slug !== undefined)
            return this.request('/v2/oi', { query: { slug: params.slug } });
        if (params.eventId !== undefined)
            return this.request('/v2/oi', { query: { event: params.eventId } });
        throw new Error('openInterest requires one of global/condition/slug/eventId');
    }
    /** Live (in-game) volume for an event id — `data.taker_volume_total` + per-market rows. */
    async liveVolume(eventId) {
        return this.request('/v2/live-volume', { query: { id: eventId } });
    }
    /** Total value of a user's positions in USD (v2 wraps the object in `data`). */
    async value(user) {
        return this.request('/v2/value', { query: { user: user.toLowerCase() } });
    }
    /**
     * User stats (v1 `/traded` → v2 `/v2/user-stats`): distinct markets traded,
     * biggest win, join date and the full all-time PnL breakdown.
     */
    async userStats(user) {
        return this.request('/v2/user-stats', { query: { user: user.toLowerCase() } });
    }
    /** User PnL time series (`interval`/`fidelity` buckets, decimal points). */
    async userPnl(params) {
        return this.request('/v2/user-pnl', {
            query: {
                user: params.user.toLowerCase(),
                interval: params.interval,
                fidelity: params.fidelity,
                limit: params.limit,
                cursor: params.cursor,
            },
        });
    }
    /** Resolution rows per condition id (use `status === "resolved"` payouts only). */
    async resolutions(params) {
        return this.request('/v2/resolutions', {
            query: {
                condition_id: joinConditions(params.conditionIds)?.toLowerCase(),
                limit: params.limit,
                cursor: params.cursor,
            },
        });
    }
    /** Token approval state of a wallet across Polymarket contracts. */
    async approvals(user) {
        return this.request('/v2/approvals', { query: { user: user.toLowerCase() } });
    }
    /** Data-API freshness: pipeline age, lagging mechanisms, ingestion cursors. */
    async status() {
        return this.request('/v2/status');
    }
}
