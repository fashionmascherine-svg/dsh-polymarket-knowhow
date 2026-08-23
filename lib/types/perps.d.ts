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
import { type HttpConfig } from './http.js';
export interface PerpsCredentials {
    proxy: string;
    secret: string;
}
/** Interval enum accepted by /v1/info/klines and /v1/info/mark-history (live-verified). */
export type PerpsInterval = '1s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '6h' | '12h' | '1d' | '1w';
export declare class PerpsClient {
    private readonly baseUrl;
    private readonly http;
    private credentials?;
    constructor(baseUrl: string, http: HttpConfig, credentials?: PerpsCredentials | undefined);
    setCredentials(creds: PerpsCredentials): void;
    hasCredentials(): boolean;
    private info;
    private authed;
    ping(): Promise<unknown>;
    serverTime(): Promise<unknown>;
    exchangeInfo(): Promise<unknown>;
    collateralAssets(): Promise<unknown>;
    /**
     * Numeric perps instrument identifier (see `instruments()`), e.g. `1` for
     * SP500-USD. Live-verified: the API rejects symbolic ids on /v1/info/*.
     */
    instruments(params?: {
        instrument_id?: number;
    }): Promise<unknown>;
    tickers(params?: {
        instrument_id?: number;
    }): Promise<unknown>;
    bestBidOffer(params: {
        instrument_id: number;
    }): Promise<unknown>;
    book(params: {
        instrument_id: number;
        depth?: number;
    }): Promise<unknown>;
    /** Kline `interval` enum (live-verified): 1s|1m|5m|15m|30m|1h|4h|6h|12h|1d|1w. Timestamps are epoch milliseconds. */
    klines(params: {
        instrument_id: number;
        interval: PerpsInterval;
        start_timestamp: number;
        end_timestamp?: number;
    }): Promise<unknown>;
    markPriceHistory(params: {
        instrument_id: number;
        interval: PerpsInterval;
        start_timestamp: number;
        end_timestamp?: number;
    }): Promise<unknown>;
    index(params: {
        asset: string;
    }): Promise<unknown>;
    recentTrades(params: {
        instrument_id: number;
        start_timestamp?: number;
        end_timestamp?: number;
    }): Promise<unknown>;
    publicPortfolio(address: string): Promise<unknown>;
    fundingHistory(params: {
        instrument_id: number;
        start_timestamp?: number;
        end_timestamp?: number;
    }): Promise<unknown>;
    fees(): Promise<unknown>;
    statistics(params?: {
        instrument_id?: number;
    }): Promise<unknown>;
    balances(): Promise<unknown>;
    accountPortfolio(): Promise<unknown>;
    fills(): Promise<unknown>;
    openOrders(): Promise<unknown>;
    ordersHistory(): Promise<unknown>;
    pnl(): Promise<unknown>;
    fundingPayments(): Promise<unknown>;
    deposits(): Promise<unknown>;
    withdrawals(): Promise<unknown>;
    limits(): Promise<unknown>;
    rewards(): Promise<unknown>;
    stats(): Promise<unknown>;
    /** Create orders. Payload shape follows `POST /v1/trade/orders`; pass through as-is. */
    createOrders(payload: unknown): Promise<unknown>;
    cancelOrder(payload: unknown): Promise<unknown>;
    cancelOrderByClientOrderId(payload: unknown): Promise<unknown>;
    cancelAllOrders(): Promise<unknown>;
    setLeverage(payload: unknown): Promise<unknown>;
}
