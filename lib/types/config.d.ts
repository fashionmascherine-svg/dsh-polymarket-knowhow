/**
 * Plugin configuration, declared with Schemastery so `cordis.yml` layers can
 * validate and override every field. Defaults live on the schema fields.
 */
import Schema from '@deepseek-ai/schemastery';
export interface TradingConfig {
    /** Register the authenticated account/trading tools. Default false. */
    enabled: boolean;
    /** L2 API key from `createOrDeriveApiKey` (or env POLY_API_KEY). */
    apiKey: string;
    /** L2 secret, base64 (or env POLY_SECRET). */
    secret: string;
    /** L2 passphrase (or env POLY_PASSPHRASE). */
    passphrase: string;
    /** Address that holds funds; for proxy wallets see polymarket.com/settings (or env POLY_ADDRESS). */
    address: string;
    /** Signature type: 0 EOA, 1 POLY_PROXY, 2 GNOSIS_SAFE. */
    signatureType: 0 | 1 | 2;
    /** Fill missing credentials from POLY_* environment variables. */
    allowEnvCredentials: boolean;
}
export interface PerpsConfig {
    /** Register Polymarket Perps (perpetual futures) tools. Default false. */
    enabled: boolean;
    /** POLYMARKET-PROXY header value (proxy address). */
    proxy: string;
    /** POLYMARKET-SECRET header value (proxy secret). */
    secret: string;
    /** Fill missing perps credentials from POLYMARKET_PROXY / POLYMARKET_SECRET env. */
    allowEnvCredentials: boolean;
}
export interface StreamConfig {
    /** Enable the market-channel WebSocket service. Default false. */
    enabled: boolean;
    /** CLOB token ids to subscribe at startup. */
    assetIds: string[];
    /** Ping interval; the server expects traffic at least every ~10s. */
    pingIntervalMs: number;
    /** Reconnect delay after an abnormal close. */
    reconnectDelayMs: number;
}
export interface Config {
    clobUrl: string;
    gammaUrl: string;
    dataApiUrl: string;
    perpsUrl: string;
    rfqUrl: string;
    bridgeUrl: string;
    relayerUrl: string;
    geoblockUrl: string;
    wsMarketUrl: string;
    wsUserUrl: string;
    timeoutMs: number;
    maxRetries: number;
    userAgent: string;
    trading: TradingConfig;
    perps: PerpsConfig;
    stream: StreamConfig;
    /** Register the embedded `polymarket` knowhow skill on ctx.skills. Default true. */
    skills: boolean;
}
export declare const Config: Schema<Config>;
/**
 * Resolve L2 trading credentials: explicit config first, then POLY_* env when
 * `allowEnvCredentials` is set. Returns `undefined` when incomplete.
 */
export declare function resolveTradingCredentials(config: TradingConfig): {
    apiKey: string;
    secret: string;
    passphrase: string;
    address: string;
    signatureType: 0 | 1 | 2;
} | undefined;
/** Resolve Perps credentials from config or POLYMARKET_* env. */
export declare function resolvePerpsCredentials(config: PerpsConfig): {
    proxy: string;
    secret: string;
} | undefined;
