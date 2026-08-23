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
import { requestJson, jsonBody } from './http.js';
export class PerpsClient {
    baseUrl;
    http;
    credentials;
    constructor(baseUrl, http, credentials) {
        this.baseUrl = baseUrl;
        this.http = http;
        this.credentials = credentials;
    }
    setCredentials(creds) {
        this.credentials = creds;
    }
    hasCredentials() {
        return this.credentials !== undefined;
    }
    async info(path, query) {
        const url = this.baseUrl.replace(/\/+$/, '') + path;
        return requestJson(url, { query }, this.http);
    }
    async authed(path, options = {}) {
        if (this.credentials === undefined) {
            throw new Error('This Perps operation requires credentials (configure perps.proxy/secret or POLYMARKET_PROXY/POLYMARKET_SECRET environment variables)');
        }
        const search = new URLSearchParams();
        if (options.query !== undefined) {
            for (const [key, value] of Object.entries(options.query)) {
                if (value === undefined)
                    continue;
                for (const item of Array.isArray(value) ? value : [value])
                    search.append(key, String(item));
            }
        }
        const encoded = search.toString();
        const pathWithQuery = encoded.length === 0 ? path : path + '?' + encoded;
        const url = this.baseUrl.replace(/\/+$/, '') + pathWithQuery;
        return requestJson(url, {
            ...options,
            query: undefined,
            headers: {
                'POLYMARKET-PROXY': this.credentials.proxy,
                'POLYMARKET-SECRET': this.credentials.secret,
            },
        }, this.http);
    }
    // ── Public market info (/v1/info/*) ────────────────────────────────────
    ping() { return this.info('/v1/info/ping'); }
    serverTime() { return this.info('/v1/info/time'); }
    exchangeInfo() { return this.info('/v1/info/exchange'); }
    collateralAssets() { return this.info('/v1/info/assets'); }
    /**
     * Numeric perps instrument identifier (see `instruments()`), e.g. `1` for
     * SP500-USD. Live-verified: the API rejects symbolic ids on /v1/info/*.
     */
    instruments(params = {}) {
        return this.info('/v1/info/instruments', { instrument_id: params.instrument_id });
    }
    tickers(params = {}) {
        return this.info('/v1/info/tickers', { instrument_id: params.instrument_id });
    }
    bestBidOffer(params) {
        return this.info('/v1/info/bbo', { instrument_id: params.instrument_id });
    }
    book(params) {
        return this.info('/v1/info/book', { instrument_id: params.instrument_id, depth: params.depth });
    }
    /** Kline `interval` enum (live-verified): 1s|1m|5m|15m|30m|1h|4h|6h|12h|1d|1w. Timestamps are epoch milliseconds. */
    klines(params) {
        return this.info('/v1/info/klines', {
            instrument_id: params.instrument_id,
            interval: params.interval,
            start_timestamp: params.start_timestamp,
            end_timestamp: params.end_timestamp,
        });
    }
    markPriceHistory(params) {
        return this.info('/v1/info/mark-history', {
            instrument_id: params.instrument_id,
            interval: params.interval,
            start_timestamp: params.start_timestamp,
            end_timestamp: params.end_timestamp,
        });
    }
    index(params) {
        return this.info('/v1/info/index', { asset: params.asset });
    }
    recentTrades(params) {
        return this.info('/v1/info/trades', {
            instrument_id: params.instrument_id,
            start_timestamp: params.start_timestamp,
            end_timestamp: params.end_timestamp,
        });
    }
    publicPortfolio(address) {
        return this.info('/v1/info/portfolio', { address });
    }
    fundingHistory(params) {
        return this.info('/v1/info/funding', {
            instrument_id: params.instrument_id,
            start_timestamp: params.start_timestamp,
            end_timestamp: params.end_timestamp,
        });
    }
    fees() { return this.info('/v1/info/fees'); }
    statistics(params = {}) {
        return this.info('/v1/info/statistics', { instrument_id: params.instrument_id });
    }
    // ── Account (/v1/account/*, authed) ────────────────────────────────────
    balances() { return this.authed('/v1/account/balances'); }
    accountPortfolio() { return this.authed('/v1/account/portfolio'); }
    fills() { return this.authed('/v1/account/fills'); }
    openOrders() { return this.authed('/v1/account/open-orders'); }
    ordersHistory() { return this.authed('/v1/account/orders'); }
    pnl() { return this.authed('/v1/account/pnl'); }
    fundingPayments() { return this.authed('/v1/account/funding'); }
    deposits() { return this.authed('/v1/account/deposits'); }
    withdrawals() { return this.authed('/v1/account/withdrawals'); }
    limits() { return this.authed('/v1/account/limits'); }
    rewards() { return this.authed('/v1/account/rewards'); }
    stats() { return this.authed('/v1/account/stats'); }
    // ── Trading (/v1/trade/*, authed) ──────────────────────────────────────
    /** Create orders. Payload shape follows `POST /v1/trade/orders`; pass through as-is. */
    createOrders(payload) {
        const { body, headers } = jsonBody(payload);
        return this.authed('/v1/trade/orders', { method: 'POST', body, headers });
    }
    cancelOrder(payload) {
        const { body, headers } = jsonBody(payload);
        return this.authed('/v1/trade/orders', { method: 'DELETE', body, headers });
    }
    cancelOrderByClientOrderId(payload) {
        const { body, headers } = jsonBody(payload);
        return this.authed('/v1/trade/orders-coid', { method: 'DELETE', body, headers });
    }
    cancelAllOrders() {
        return this.authed('/v1/trade/orders/all', { method: 'DELETE' });
    }
    setLeverage(payload) {
        const { body, headers } = jsonBody(payload);
        return this.authed('/v1/trade/leverage', { method: 'PATCH', body, headers });
    }
}
