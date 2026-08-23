/**
 * Lighter clients: Bridge, Combos RFQ, Relayer and the geoblock check.
 * These surfaces are fully exposed on the `polymarket` service; only safe,
 * read-only parts are registered as model tools.
 */
import { type HttpConfig } from './http.js';
export declare class BridgeClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    private request;
    supportedAssets(): Promise<unknown>;
    /** Create deposit addresses for depositing into Polymarket. */
    createDepositAddress(params: {
        address: string;
        asset?: string;
        chain?: string;
    }): Promise<unknown>;
    status(address: string): Promise<unknown>;
    quote(params: Record<string, unknown>): Promise<unknown>;
}
export declare class RfqClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    /** Public listing of combinatorial (combo) markets. */
    comboMarkets(params?: {
        limit?: number;
        cursor?: string;
        exclude?: string;
    }): Promise<unknown>;
}
export declare class RelayerClient {
    private readonly baseUrl;
    private readonly http;
    constructor(baseUrl: string, http: HttpConfig);
    private request;
    /** Whether a wallet (Safe/proxy) is deployed on Polygon. */
    isDeployed(address: string): Promise<unknown>;
}
export interface GeoblockStatus {
    blocked: boolean;
    ip?: string;
    country?: string;
    region?: string;
    [key: string]: unknown;
}
/** Check whether this deployment's egress IP is geoblocked by Polymarket. */
export declare function checkGeoblock(geoblockUrl: string, http: HttpConfig, signal?: AbortSignal): Promise<GeoblockStatus>;
