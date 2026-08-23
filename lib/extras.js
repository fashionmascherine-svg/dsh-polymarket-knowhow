/**
 * Lighter clients: Bridge, Combos RFQ, Relayer and the geoblock check.
 * These surfaces are fully exposed on the `polymarket` service; only safe,
 * read-only parts are registered as model tools.
 */
import { requestJson, jsonBody } from './http.js';
export class BridgeClient {
    baseUrl;
    http;
    constructor(baseUrl, http) {
        this.baseUrl = baseUrl;
        this.http = http;
    }
    request(path, options = {}) {
        return requestJson(this.baseUrl.replace(/\/+$/, '') + path, options, this.http);
    }
    supportedAssets() {
        return this.request('/supported-assets');
    }
    /** Create deposit addresses for depositing into Polymarket. */
    createDepositAddress(params) {
        const { body, headers } = jsonBody({ address: params.address, asset: params.asset, chain: params.chain });
        return this.request('/deposit', { method: 'POST', body, headers });
    }
    status(address) {
        return this.request(`/status/${encodeURIComponent(address)}`);
    }
    quote(params) {
        const { body, headers } = jsonBody(params);
        return this.request('/quote', { method: 'POST', body, headers });
    }
}
export class RfqClient {
    baseUrl;
    http;
    constructor(baseUrl, http) {
        this.baseUrl = baseUrl;
        this.http = http;
    }
    /** Public listing of combinatorial (combo) markets. */
    comboMarkets(params = {}) {
        return requestJson(this.baseUrl.replace(/\/+$/, '') + '/v1/rfq/combo-markets', {
            query: { limit: params.limit, cursor: params.cursor, exclude: params.exclude },
        }, this.http);
    }
}
export class RelayerClient {
    baseUrl;
    http;
    constructor(baseUrl, http) {
        this.baseUrl = baseUrl;
        this.http = http;
    }
    request(path, query) {
        return requestJson(this.baseUrl.replace(/\/+$/, '') + path, { query }, this.http);
    }
    /** Whether a wallet (Safe/proxy) is deployed on Polygon. */
    isDeployed(address) {
        return this.request('/deployed', { address: address.toLowerCase() });
    }
}
/** Check whether this deployment's egress IP is geoblocked by Polymarket. */
export async function checkGeoblock(geoblockUrl, http, signal) {
    return requestJson(geoblockUrl, { signal }, http);
}
