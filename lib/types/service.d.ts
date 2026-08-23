/**
 * Core Polymarket service (`ctx.polymarket`).
 *
 * Owns one HTTP config and one client instance per Polymarket API surface so
 * other plugins and all model tools share connection settings, credentials
 * and error handling. Registered as a Cordis service; disposal removes it.
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import { Config, type Config as PluginConfig } from './config.js';
import { GammaClient } from './gamma.js';
import { DataApiClient } from './data.js';
import { ClobClient, type L2Credentials } from './clob.js';
import { PerpsClient } from './perps.js';
import { BridgeClient, RfqClient, RelayerClient, type GeoblockStatus } from './extras.js';
export declare class PolymarketService extends Service {
    /** Resolved L2 credentials, or undefined when trading is not configured. */
    readonly tradingCredentials: L2Credentials | undefined;
    readonly perpsCredentials: {
        proxy: string;
        secret: string;
    } | undefined;
    readonly gamma: GammaClient;
    readonly dataApi: DataApiClient;
    readonly clob: ClobClient;
    readonly perps: PerpsClient;
    readonly rfq: RfqClient;
    readonly bridge: BridgeClient;
    readonly relayer: RelayerClient;
    private readonly pluginConfig;
    private readonly http;
    constructor(ctx: Context, config: PluginConfig);
    get config(): PluginConfig;
    get clobUrl(): string;
    /** Check whether this deployment's egress IP is geoblocked by Polymarket. */
    geoblock(signal?: AbortSignal): Promise<GeoblockStatus>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        polymarket: PolymarketService;
    }
}
export declare const name = "polymarket-service";
export declare const inject: string[];
export { Config };
export declare function apply(ctx: Context, config: Config): void;
