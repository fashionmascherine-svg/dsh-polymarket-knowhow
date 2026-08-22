/**
 * Lighter clients: Bridge, Combos RFQ, Relayer and the geoblock check.
 * These surfaces are fully exposed on the `polymarket` service; only safe,
 * read-only parts are registered as model tools.
 */
import { requestJson, jsonBody, type HttpConfig, type RequestOptions } from './http.js'

export class BridgeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
  ) {}

  private request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>(this.baseUrl.replace(/\/+$/, '') + path, options, this.http)
  }

  supportedAssets(): Promise<unknown> {
    return this.request('/supported-assets')
  }

  /** Create deposit addresses for depositing into Polymarket. */
  createDepositAddress(params: { address: string; asset?: string; chain?: string }): Promise<unknown> {
    const { body, headers } = jsonBody({ address: params.address, asset: params.asset, chain: params.chain })
    return this.request('/deposit', { method: 'POST', body, headers })
  }

  status(address: string): Promise<unknown> {
    return this.request(`/status/${encodeURIComponent(address)}`)
  }

  quote(params: Record<string, unknown>): Promise<unknown> {
    const { body, headers } = jsonBody(params)
    return this.request('/quote', { method: 'POST', body, headers })
  }
}

export class RfqClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
  ) {}

  /** Public listing of combinatorial (combo) markets. */
  comboMarkets(params: { limit?: number; cursor?: string; exclude?: string } = {}): Promise<unknown> {
    return requestJson<unknown>(this.baseUrl.replace(/\/+$/, '') + '/v1/rfq/combo-markets', {
      query: { limit: params.limit, cursor: params.cursor, exclude: params.exclude },
    }, this.http)
  }
}

export class RelayerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpConfig,
  ) {}

  private request<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return requestJson<T>(this.baseUrl.replace(/\/+$/, '') + path, { query }, this.http)
  }

  /** Whether a wallet (Safe/proxy) is deployed on Polygon. */
  isDeployed(address: string): Promise<unknown> {
    return this.request('/deployed', { address: address.toLowerCase() })
  }
}

export interface GeoblockStatus {
  blocked: boolean
  ip?: string
  country?: string
  region?: string
  [key: string]: unknown
}

/** Check whether this deployment's egress IP is geoblocked by Polymarket. */
export async function checkGeoblock(
  geoblockUrl: string,
  http: HttpConfig,
  signal?: AbortSignal,
): Promise<GeoblockStatus> {
  return requestJson<GeoblockStatus>(geoblockUrl, { signal }, http)
}
