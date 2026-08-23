/**
 * Client for the Polymarket Data API — positions, trades, activity, holders,
 * leaderboards, open interest and portfolio value. No auth for these reads.
 *
 * Endpoint set verified against `data-openapi.yaml` and live responses.
 * Notable parameter shapes (live-verified):
 * - `/live-volume` takes `id` (the event id), not `event`.
 * - `/holders` requires the full 32-byte market (condition) id.
 */
import { type HttpConfig } from './http.js';
export interface DataPosition {
    proxyWallet?: string;
    asset?: string;
    conditionId?: string;
    size?: number;
    avgPrice?: number;
    initialValue?: number;
    currentValue?: number;
    cashPnl?: number;
    percentPnl?: number;
    totalBought?: number;
    realizedPnl?: number;
    curPrice?: number;
    redeemable?: boolean;
    mergeable?: boolean;
    title?: string;
    slug?: string;
    outcome?: string;
    endDate?: string;
    negativeRisk?: boolean;
    [key: string]: unknown;
}
export interface DataTrade {
    proxyWallet?: string;
    side?: 'BUY' | 'SELL';
    asset?: string;
    conditionId?: string;
    size?: number;
    price?: number;
    outcome?: string;
    outcomeIndex?: number;
    timestamp?: number;
    title?: string;
    slug?: string;
    transactionHash?: string;
    pseudonym?: string;
    name?: string;
    [key: string]: unknown;
}
export declare class DataApiClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    private request;
    /** Current ERC1155 positions for a wallet (`user` required). */
    positions(params: {
        user: string;
        market?: string | string[];
        sizeThreshold?: number;
        redeemable?: boolean;
        mergeable?: boolean;
        limit?: number;
        offset?: number;
        sortBy?: 'CURRENT' | 'CASH' | 'TIME' | 'CASHPNL' | 'PERCENTPNL';
        sortDirection?: 'ASC' | 'DESC';
    }): Promise<DataPosition[]>;
    /** Positions that already resolved (`GET /closed-positions`). */
    closedPositions(params: {
        user: string;
        limit?: number;
        offset?: number;
        sortBy?: string;
    }): Promise<unknown>;
    /** Public trades filtered by user and/or market. */
    trades(params: {
        user?: string;
        market?: string | string[];
        limit?: number;
        offset?: number;
        takerOnly?: boolean;
        filterType?: 'CASH' | 'TOKENS';
        filterAmount?: number;
        side?: 'BUY' | 'SELL';
    }): Promise<DataTrade[]>;
    /** On-chain user activity (trades, splits, merges, redemptions…). */
    activity(params: {
        user: string;
        limit?: number;
        offset?: number;
        type?: string[];
        start?: number;
        end?: number;
        side?: 'BUY' | 'SELL';
        conditionId?: string;
    }): Promise<unknown>;
    /** Top holders for one or more markets (full condition ids). */
    holders(params: {
        market: string | string[];
        limit?: number;
    }): Promise<unknown>;
    /**
     * Trader leaderboard rankings. The official spec param is `timePeriod`
     * (DAY|WEEK|MONTH|ALL); production also tolerates the legacy `window`
     * spelling (live-verified both return 200 on /v1/leaderboard).
     */
    leaderboard(params?: {
        timePeriod?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL';
        limit?: number;
    }): Promise<unknown>;
    /** Open interest; pass either `global: true`, a market (condition id), slug, or event id. */
    openInterest(params: {
        global?: boolean;
        market?: string;
        slug?: string;
        eventId?: string;
    }): Promise<unknown>;
    /** Live (in-game) volume for an event id. */
    liveVolume(eventId: string): Promise<unknown>;
    /** Total value of a user's positions in USD. */
    value(user: string): Promise<Array<{
        user: string;
        value: number;
    }>>;
    /** Number of distinct markets a user has traded. */
    traded(user: string): Promise<unknown>;
    /** Positions of all users for one market (`GET /v1/market-positions`). */
    marketPositions(params: {
        market: string;
        limit?: number;
    }): Promise<unknown>;
    /** "Other" share size for augmented neg-risk events (`id` = event id). */
    otherSize(params: {
        eventId: string;
        user?: string;
    }): Promise<unknown>;
}
