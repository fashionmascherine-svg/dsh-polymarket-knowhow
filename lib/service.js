/**
 * Core Polymarket service (`ctx.polymarket`).
 *
 * Owns one HTTP config and one client instance per Polymarket API surface so
 * other plugins and all model tools share connection settings, credentials
 * and error handling. Registered as a Cordis service; disposal removes it.
 */
import { Service } from '@deepseek-ai/cordis';
import { Config, resolveTradingCredentials, resolvePerpsCredentials, } from './config.js';
import { GammaClient } from './gamma.js';
import { DataApiClient } from './data.js';
import { ClobClient } from './clob.js';
import { PerpsClient } from './perps.js';
import { BridgeClient, RfqClient, RelayerClient, checkGeoblock } from './extras.js';
export class PolymarketService extends Service {
    /** Resolved L2 credentials, or undefined when trading is not configured. */
    tradingCredentials;
    perpsCredentials;
    gamma;
    dataApi;
    clob;
    perps;
    rfq;
    bridge;
    relayer;
    pluginConfig;
    http;
    constructor(ctx, config) {
        super(ctx, 'polymarket');
        this.pluginConfig = config;
        this.http = {
            timeoutMs: config.timeoutMs,
            maxRetries: config.maxRetries,
            userAgent: config.userAgent,
        };
        // Trading tools are only registered when enabled AND creds resolve.
        this.tradingCredentials = config.trading.enabled === true
            ? resolveTradingCredentials(config.trading)
            : undefined;
        this.perpsCredentials = config.perps.enabled === true
            ? resolvePerpsCredentials(config.perps)
            : undefined;
        this.gamma = new GammaClient(config.gammaUrl, this.http);
        this.dataApi = new DataApiClient(config.dataApiUrl, this.http);
        this.clob = new ClobClient(config.clobUrl, this.http, this.tradingCredentials);
        this.perps = new PerpsClient(config.perpsUrl, this.http, this.perpsCredentials);
        this.rfq = new RfqClient(config.rfqUrl, this.http);
        this.bridge = new BridgeClient(config.bridgeUrl, this.http);
        this.relayer = new RelayerClient(config.relayerUrl, this.http);
        if (config.trading.enabled === true && this.tradingCredentials === undefined) {
            ctx.logger.warn('polymarket: trading.enabled=true but L2 credentials are incomplete '
                + '(need apiKey/secret/passphrase/address in config or POLY_API_KEY/POLY_SECRET/POLY_PASSPHRASE/POLY_ADDRESS env); account tools will fail until configured');
        }
    }
    get config() {
        return this.pluginConfig;
    }
    get clobUrl() {
        return this.pluginConfig.clobUrl;
    }
    /** Check whether this deployment's egress IP is geoblocked by Polymarket. */
    async geoblock(signal) {
        return checkGeoblock(this.pluginConfig.geoblockUrl, this.http, signal);
    }
}
export const name = 'polymarket-service';
export const inject = [];
// Re-exported so the loader validates row config against the schema and
// fills defaults before calling apply.
export { Config };
export function apply(ctx, config) {
    void new PolymarketService(ctx, config);
}
