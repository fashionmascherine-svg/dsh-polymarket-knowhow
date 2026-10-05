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
import { type HttpConfig } from './http.js';
/** v2 pagination echo (cursor superseded offset; `offset` stays request-rejected). */
export interface DataPagination {
    limit?: number;
    offset?: number;
    has_more?: boolean;
    next_cursor?: string | null;
    [key: string]: unknown;
}
/** v2 envelope: list routes return an array under `data`, single-object routes an object. */
export interface DataPage<T> {
    data: T | null;
    pagination?: DataPagination;
    [key: string]: unknown;
}
export type PositionStatus = 'OPEN' | 'REDEEMABLE' | 'REDEEMABLE_LOST' | 'MERGEABLE' | 'CLOSED';
export interface DataPosition {
    proxy_wallet?: string;
    token_id?: string;
    condition_id?: string;
    current_size?: number;
    avg_price?: number;
    entry_cost_usdc?: number;
    entry_fees_usdc?: number;
    total_cost_usdc?: number;
    current_price?: number;
    current_value?: number;
    total_size?: number;
    realized_pnl?: number;
    unrealized_pnl?: number;
    total_pnl?: number;
    percent_pnl?: number;
    percent_realized_pnl?: number;
    status?: PositionStatus | string;
    redeemable?: boolean;
    mergeable?: boolean;
    negative_risk?: boolean;
    archived?: boolean;
    title?: string;
    slug?: string;
    icon?: string;
    event_id?: string;
    event_slug?: string;
    outcome?: string;
    outcome_index?: number;
    opposite_outcome?: string;
    opposite_token_id?: string;
    end_date?: string;
    last_event_at?: number;
    first_entry_at?: number;
    name?: string;
    pseudonym?: string;
    profile_image?: string;
    [key: string]: unknown;
}
export interface DataTrade {
    proxy_wallet?: string;
    side?: 'BUY' | 'SELL';
    token_id?: string;
    condition_id?: string;
    size?: number;
    price?: number;
    timestamp?: number;
    title?: string;
    slug?: string;
    icon?: string;
    event_slug?: string;
    outcome?: string;
    outcome_index?: number;
    name?: string;
    pseudonym?: string;
    bio?: string;
    profile_image?: string;
    transaction_hash?: string;
    [key: string]: unknown;
}
export interface DataActivity {
    proxy_wallet?: string;
    timestamp?: number;
    condition_id?: string;
    type?: string;
    size?: number;
    usdc_size?: number;
    transaction_hash?: string;
    price?: number;
    token_id?: string;
    side?: 'BUY' | 'SELL';
    outcome_index?: number;
    title?: string;
    slug?: string;
    icon?: string;
    event_slug?: string;
    outcome?: string;
    name?: string;
    pseudonym?: string;
    [key: string]: unknown;
}
/** One `data` row of GET /v2/holders: holders grouped per outcome token. */
export interface DataHolderGroup {
    token_id?: string;
    holders?: Array<{
        proxy_wallet?: string;
        token_id?: string;
        name?: string;
        pseudonym?: string;
        bio?: string;
        amount?: number;
        outcome_index?: number;
        verified?: boolean;
        display_username_public?: boolean;
        profile_image?: string;
        profile_image_optimized?: string;
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
}
/** `data` row of GET /v2/resolutions (payouts in 6-decimal base units). */
export interface DataResolution {
    condition_id?: string;
    /** Production also emits `posed` (proposal pending) beyond the documented three. */
    status?: 'inactive' | 'active' | 'posed' | 'resolved' | string;
    payouts?: number[];
    resolved_at?: string;
    resolved_block?: number;
    resolution_source?: string;
    was_disputed?: boolean;
    extended_review?: boolean;
    transaction_hash?: string;
    [key: string]: unknown;
}
export declare class DataApiClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    private request;
    /** Positions for a wallet and/or market (`user` and `condition` both optional). */
    positions(params: {
        user?: string;
        condition?: string | string[];
        status?: PositionStatus;
        sizeThreshold?: number;
        redeemable?: boolean;
        mergeable?: boolean;
        archived?: boolean;
        sortBy?: 'CURRENT_VALUE' | 'TOTAL_PNL' | 'REALIZED_PNL' | 'UNREALIZED_PNL';
        sortDirection?: 'ASC' | 'DESC';
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<DataPosition>>;
    /** Positions that already resolved (v1 `/closed-positions` → `status=CLOSED`). */
    closedPositions(params: {
        user: string;
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<DataPosition>>;
    /** Positions of all users for one market (v1 `/v1/market-positions` → `condition`). */
    marketPositions(params: {
        condition: string;
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<DataPosition>>;
    /** Public trades filtered by user and/or market. */
    trades(params: {
        user?: string;
        condition?: string | string[];
        limit?: number;
        cursor?: string;
        takerOnly?: boolean;
        filterType?: 'CASH' | 'TOKENS';
        filterAmount?: number;
        side?: 'BUY' | 'SELL';
    }): Promise<DataPage<DataTrade>>;
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
    activity(params: {
        user: string;
        limit?: number;
        cursor?: string;
        type?: string[];
        start?: number;
        end?: number;
        side?: 'BUY' | 'SELL';
        conditionId?: string;
    }): Promise<DataPage<DataActivity>>;
    /** Top holders for one or more markets (full condition ids; v2 param is `condition`). */
    holders(params: {
        condition: string | string[];
        limit?: number;
        includePnl?: boolean;
    }): Promise<DataPage<DataHolderGroup> | Array<DataPage<DataHolderGroup>>>;
    /**
     * Trader leaderboard rankings (v2 `/v2/leaderboard`, param `time_period`).
     * Rows carry `rank`, `user_id`, `pnl`, `volume`, `user_name`.
     */
    leaderboard(params?: {
        timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<Record<string, unknown>>>;
    /** Open interest; pass either `global: true`, a condition id, slug, or event id. */
    openInterest(params: {
        global?: boolean;
        condition?: string;
        slug?: string;
        eventId?: string;
    }): Promise<DataPage<{
        condition_id?: string;
        value?: number;
    }>>;
    /** Live (in-game) volume for an event id — `data.taker_volume_total` + per-market rows. */
    liveVolume(eventId: string): Promise<DataPage<{
        taker_volume_total?: number;
        conditions?: Array<{
            condition_id?: string;
            taker_volume?: number;
        }>;
    }>>;
    /** Total value of a user's positions in USD (v2 wraps the object in `data`). */
    value(user: string): Promise<DataPage<{
        proxy_wallet?: string;
        value?: number;
    }>>;
    /**
     * User stats (v1 `/traded` → v2 `/v2/user-stats`): distinct markets traded,
     * biggest win, join date and the full all-time PnL breakdown.
     */
    userStats(user: string): Promise<DataPage<Record<string, unknown>>>;
    /** User PnL time series (`interval`/`fidelity` buckets, decimal points). */
    userPnl(params: {
        user: string;
        interval?: string;
        fidelity?: string;
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<Record<string, unknown>>>;
    /** Resolution rows per condition id (use `status === "resolved"` payouts only). */
    resolutions(params: {
        conditionIds: string | string[];
        limit?: number;
        cursor?: string;
    }): Promise<DataPage<DataResolution>>;
    /** Token approval state of a wallet across Polymarket contracts. */
    approvals(user: string): Promise<DataPage<Record<string, unknown>>>;
    /** Data-API freshness: pipeline age, lagging mechanisms, ingestion cursors. */
    status(): Promise<DataPage<Record<string, unknown>>>;
}
