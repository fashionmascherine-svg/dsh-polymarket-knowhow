/**
 * Plugin configuration, declared with Schemastery so `cordis.yml` layers can
 * validate and override every field. Defaults live on the schema fields.
 */
import Schema from '@deepseek-ai/schemastery'

export interface TradingConfig {
  /** Register the authenticated account/trading tools. Default false. */
  enabled: boolean
  /** L2 API key from `createOrDeriveApiKey` (or env POLY_API_KEY). */
  apiKey: string
  /** L2 secret, base64 (or env POLY_SECRET). */
  secret: string
  /** L2 passphrase (or env POLY_PASSPHRASE). */
  passphrase: string
  /** Address that holds funds; for proxy wallets see polymarket.com/settings (or env POLY_ADDRESS). */
  address: string
  /** Signature type: 0 EOA, 1 POLY_PROXY, 2 GNOSIS_SAFE. */
  signatureType: 0 | 1 | 2
  /** Fill missing credentials from POLY_* environment variables. */
  allowEnvCredentials: boolean
}

export interface PerpsConfig {
  /** Register Polymarket Perps (perpetual futures) tools. Default false. */
  enabled: boolean
  /** POLYMARKET-PROXY header value (proxy address). */
  proxy: string
  /** POLYMARKET-SECRET header value (proxy secret). */
  secret: string
  /** Fill missing perps credentials from POLYMARKET_PROXY / POLYMARKET_SECRET env. */
  allowEnvCredentials: boolean
}

export interface StreamConfig {
  /** Enable the market-channel WebSocket service. Default false. */
  enabled: boolean
  /** CLOB token ids to subscribe at startup. */
  assetIds: string[]
  /** Ping interval; the server expects traffic at least every ~10s. */
  pingIntervalMs: number
  /** Reconnect delay after an abnormal close. */
  reconnectDelayMs: number
}

export interface Config {
  clobUrl: string
  gammaUrl: string
  dataApiUrl: string
  perpsUrl: string
  rfqUrl: string
  bridgeUrl: string
  relayerUrl: string
  geoblockUrl: string
  wsMarketUrl: string
  wsUserUrl: string
  timeoutMs: number
  maxRetries: number
  userAgent: string
  trading: TradingConfig
  perps: PerpsConfig
  stream: StreamConfig
  /** Register the embedded `polymarket` knowhow skill on ctx.skills. Default true. */
  skills: boolean
}

const endpoint = (def: string) => Schema.string().default(def)

export const Config: Schema<Config> = Schema.object({
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
    signatureType: Schema.union([0, 1, 2] as const).default(2),
    allowEnvCredentials: Schema.boolean().default(true),
  } as const).default({} as any),
  perps: Schema.object({
    enabled: Schema.boolean().default(false),
    proxy: Schema.string().default(''),
    secret: Schema.string().default(''),
    allowEnvCredentials: Schema.boolean().default(true),
  } as const).default({} as any),
  stream: Schema.object({
    enabled: Schema.boolean().default(false),
    assetIds: Schema.array(Schema.string()).default([]),
    pingIntervalMs: Schema.number().default(10_000),
    reconnectDelayMs: Schema.number().default(2_000),
  } as const).default({} as any),
  skills: Schema.boolean().default(true),
}) as unknown as Schema<Config>

/**
 * Resolve L2 trading credentials: explicit config first, then POLY_* env when
 * `allowEnvCredentials` is set. Returns `undefined` when incomplete.
 */
export function resolveTradingCredentials(config: TradingConfig): {
  apiKey: string
  secret: string
  passphrase: string
  address: string
  signatureType: 0 | 1 | 2
} | undefined {
  const env = config.allowEnvCredentials ? process.env : {}
  const apiKey = config.apiKey || env.POLY_API_KEY || ''
  const secret = config.secret || env.POLY_SECRET || ''
  const passphrase = config.passphrase || env.POLY_PASSPHRASE || ''
  const address = config.address || env.POLY_ADDRESS || ''
  if (apiKey === '' || secret === '' || passphrase === '' || address === '') return undefined
  return { apiKey, secret, passphrase, address, signatureType: config.signatureType }
}

/** Resolve Perps credentials from config or POLYMARKET_* env. */
export function resolvePerpsCredentials(config: PerpsConfig): { proxy: string; secret: string } | undefined {
  const env = config.allowEnvCredentials ? process.env : {}
  const proxy = config.proxy || env.POLYMARKET_PROXY || ''
  const secret = config.secret || env.POLYMARKET_SECRET || ''
  if (proxy === '' || secret === '') return undefined
  return { proxy, secret }
}
