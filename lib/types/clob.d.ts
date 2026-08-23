import { type HttpConfig } from './http.js';
export interface L2Credentials {
    apiKey: string;
    secret: string;
    passphrase: string;
    address: string;
    signatureType: number;
}
export interface OrderBookLevel {
    price: string;
    size: string;
}
export interface OrderBook {
    market: string;
    asset_id: string;
    timestamp?: string;
    hash?: string;
    bids?: OrderBookLevel[];
    asks?: OrderBookLevel[];
    tick_size?: string;
    neg_risk?: boolean;
    min_order_size?: string;
    [key: string]: unknown;
}
export interface PriceHistoryPoint {
    t: number;
    p: number;
}
export declare const PRICE_HISTORY_INTERVALS: readonly ["all", "1h", "6h", "1d", "1w", "1m", "max"];
export type PriceHistoryInterval = typeof PRICE_HISTORY_INTERVALS[number];
/** Build the five L2 authentication headers for one request. */
export declare function buildL2Headers(creds: L2Credentials, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', pathWithQuery: string, body: string | undefined, timestamp?: string): Record<string, string>;
export declare class ClobClient {
    private readonly baseUrl;
    private readonly http;
    private credentials?;
    constructor(baseUrl: string, http: HttpConfig, credentials?: L2Credentials | undefined);
    setCredentials(creds: L2Credentials): void;
    hasCredentials(): boolean;
    /** Public request: no auth headers. */
    private public;
    /** Authenticated request: signs method + path-with-query (+ body). */
    private l2;
    getServerTime(): Promise<unknown>;
    getBook(tokenId: string): Promise<OrderBook>;
    getBooks(tokenIds: string[]): Promise<OrderBook[]>;
    getPrice(tokenId: string, side: 'BUY' | 'SELL'): Promise<{
        price: string;
    }>;
    /** Live-verified flat payload; response maps token id -> {BUY|SELL: price}. */
    getPrices(requests: Array<{
        tokenId: string;
        side: 'BUY' | 'SELL';
    }>): Promise<Record<string, {
        BUY?: string;
        SELL?: string;
    }>>;
    getMidpoints(tokenIds: string[]): Promise<Record<string, string>>;
    getSpreads(tokenIds: string[]): Promise<Record<string, string>>;
    getLastTradesPrices(tokenIds: string[]): Promise<Array<{
        price: string;
        side?: string;
        token_id?: string;
    }>>;
    getMidpoint(tokenId: string): Promise<{
        mid: string;
    }>;
    getSpread(tokenId: string): Promise<{
        spread: string;
    }>;
    getLastTradePrice(tokenId: string): Promise<{
        price: string;
        side?: string;
        hash?: string;
        timestamp?: string;
    }>;
    private readonly staticCache;
    /** Memoize a rarely-changing per-token fact for STATIC_TTL_MS. */
    private cached;
    /** Tick size is fixed per market once listed — safe to memoize briefly. */
    getTickSize(tokenId: string): Promise<{
        minimum_tick_size: number | string;
    }>;
    /** Neg-risk flag is a market-level constant — safe to memoize briefly. */
    getNegRisk(tokenId: string): Promise<{
        neg_risk: boolean;
    }>;
    /**
     * Price history for one asset. Either an interval OR an explicit
     * startTs/endTs range; `fidelity` is minutes between points (default 1).
     */
    getPricesHistory(params: {
        market: string;
        interval?: PriceHistoryInterval;
        startTs?: number;
        endTs?: number;
        fidelity?: number;
    }): Promise<{
        history: PriceHistoryPoint[];
    }>;
    /** Batch price history, up to 20 markets per call (`POST /batch-prices-history`). */
    getBatchPricesHistory(params: {
        markets: string[];
        startTs?: number;
        endTs?: number;
        interval?: PriceHistoryInterval;
        fidelity?: number;
    }): Promise<Array<{
        market: string;
        history: PriceHistoryPoint[];
    }>>;
    /** Resolve a CLOB token id back to its market (`GET /markets-by-token/{token_id}`). */
    getMarketByToken(tokenId: string): Promise<unknown>;
    /** CLOB-side market info by condition id. */
    getClobMarket(conditionId: string): Promise<unknown>;
    /** Simplified markets listing (token ids, tick size, neg risk, min size). */
    getSimplifiedMarkets(nextCursor?: string): Promise<unknown>;
    getFeeRate(tokenId?: string): Promise<unknown>;
    /** Current liquidity-reward configurations across markets. */
    getRewardMarkets(): Promise<unknown>;
    /** Open orders; filter by market (condition id) and/or asset id. */
    getOrders(params?: {
        market?: string;
        assetId?: string;
        id?: string;
    }): Promise<unknown>;
    getOrder(orderId: string): Promise<unknown>;
    /** Your trades; filter by market/asset and pagination cursor. */
    getTrades(params?: {
        market?: string;
        assetId?: string;
        before?: number;
        after?: number;
        limit?: number;
    }): Promise<unknown>;
    cancelOrder(orderId: string): Promise<unknown>;
    cancelOrders(orderIds: string[]): Promise<unknown>;
    cancelAllOrders(): Promise<unknown>;
    /** Cancel all open orders for one (market, asset) pair. Both fields are required by the API. */
    cancelMarketOrders(marketConditionId: string, assetId: string): Promise<unknown>;
    /**
     * Trading heartbeat. While trading, send at least every ~5s; a lapse of
     * >10s cancels all your open orders. First call passes ''.
     */
    sendHeartbeat(heartbeatId: string): Promise<{
        heartbeat_id: string;
        [key: string]: unknown;
    }>;
    /** Collateral/conditional balance and allowance for the funder address. */
    getBalanceAllowance(assetType: 'COLLATERAL' | 'CONDITIONAL', tokenId?: string): Promise<unknown>;
    /** List all API keys on the account. */
    getApiKeys(): Promise<unknown>;
    /** Whether the account is restricted to close-only mode. */
    getBanStatus(): Promise<unknown>;
    getNotifications(): Promise<unknown>;
}
