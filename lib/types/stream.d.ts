/**
 * Optional market-channel WebSocket bridge (`wss://ws-subscriptions-clob…`).
 *
 * Off by default; enable with `stream.enabled` plus `stream.assetIds`.
 * Maintains one subscription, keeps it alive with 10s PING frames (the server
 * expects traffic at least every ~10s), reconnects with a fixed delay after
 * abnormal closes, and re-emits every parsed event on the Cordis event
 * `polymarket/market-event`. All resources belong to the plugin fiber.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
export interface PolymarketMarketEvent {
    channel: 'market';
    event_type?: string;
    asset_id?: string;
    market?: string;
    payload: Record<string, unknown>;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        /** One parsed market-channel event (book / price_change / last_trade_price / …). */
        'polymarket/market-event'(payload: PolymarketMarketEvent): void;
    }
}
export declare const name = "polymarket-stream";
export declare const inject: string[];
export { Config };
export declare function apply(ctx: Context, config: Config): void;
