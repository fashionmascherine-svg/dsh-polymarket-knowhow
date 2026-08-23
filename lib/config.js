/**
 * Plugin configuration, declared with Schemastery so `cordis.yml` layers can
 * validate and override every field. Defaults live on the schema fields.
 */
import Schema from '@deepseek-ai/schemastery';
const endpoint = (def) => Schema.string().default(def);
export const Config = Schema.object({
    clobUrl: endpoint('https://clob.polymarket.com'),
    gammaUrl: endpoint('https://gamma-api.polymarket.com'),
    dataApiUrl: endpoint('https://data-api.polymarket.com'),
    perpsUrl: endpoint('https://api.perpetuals.polymarket.com'),
    rfqUrl: endpoint('https://combos-rfq-api.polymarket.com'),
    bridgeUrl: endpoint('https://bridge.polymarket.com'),
    relayerUrl: endpoint('https://relayer-v2.polymarket.com'),
    geoblockUrl: endpoint('https://polymarket.com/api/geoblock'),
    wsMarketUrl: endpoint('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
    wsUserUrl: endpoint('wss://ws-subscriptions-clob.polymarket.com/ws/user'),
    timeoutMs: Schema.number().default(15_000),
    maxRetries: Schema.number().min(0).max(5).default(2),
    userAgent: Schema.string().default('dsh-polymarket-knowhow'),
    trading: Schema.object({
        enabled: Schema.boolean().default(false),
        apiKey: Schema.string().default(''),
        secret: Schema.string().default(''),
        passphrase: Schema.string().default(''),
        address: Schema.string().default(''),
        signatureType: Schema.union([0, 1, 2]).default(2),
        allowEnvCredentials: Schema.boolean().default(true),
    }).default({}),
    perps: Schema.object({
        enabled: Schema.boolean().default(false),
        proxy: Schema.string().default(''),
        secret: Schema.string().default(''),
        allowEnvCredentials: Schema.boolean().default(true),
    }).default({}),
    stream: Schema.object({
        enabled: Schema.boolean().default(false),
        assetIds: Schema.array(Schema.string()).default([]),
        pingIntervalMs: Schema.number().default(10_000),
        reconnectDelayMs: Schema.number().default(2_000),
    }).default({}),
    skills: Schema.boolean().default(true),
});
/**
 * Resolve L2 trading credentials: explicit config first, then POLY_* env when
 * `allowEnvCredentials` is set. Returns `undefined` when incomplete.
 */
export function resolveTradingCredentials(config) {
    const env = config.allowEnvCredentials ? process.env : {};
    const apiKey = config.apiKey || env.POLY_API_KEY || '';
    const secret = config.secret || env.POLY_SECRET || '';
    const passphrase = config.passphrase || env.POLY_PASSPHRASE || '';
    const address = config.address || env.POLY_ADDRESS || '';
    if (apiKey === '' || secret === '' || passphrase === '' || address === '')
        return undefined;
    return { apiKey, secret, passphrase, address, signatureType: config.signatureType };
}
/** Resolve Perps credentials from config or POLYMARKET_* env. */
export function resolvePerpsCredentials(config) {
    const env = config.allowEnvCredentials ? process.env : {};
    const proxy = config.proxy || env.POLYMARKET_PROXY || '';
    const secret = config.secret || env.POLYMARKET_SECRET || '';
    if (proxy === '' || secret === '')
        return undefined;
    return { proxy, secret };
}
