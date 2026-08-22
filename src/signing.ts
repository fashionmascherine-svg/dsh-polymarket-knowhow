/**
 * Optional order-signing integration via the official `@polymarket/clob-client`.
 *
 * Placing an order requires an EIP-712 signature over the exchange order
 * struct. Rather than re-implementing wallet cryptography (and risking
 * signature drift with the on-chain contracts), this module lazily loads the
 * official TypeScript SDK when it is resolvable and delegates order creation
 * to it. When the SDK is not installed, the caller gets an actionable error.
 *
 * To enable: add `@polymarket/clob-client` (and `ethers` v5) to your profile,
 * e.g. `dsh plugin --profile <name> add @polymarket/clob-client` or a manual
 * dependency entry, then configure trading credentials + private key.
 */

export interface PlaceOrderArgs {
  tokenId: string
  side: 'BUY' | 'SELL'
  /** Limit price in [tick, 1-tick]. */
  price: number
  /** Size in shares for limit orders; dollar amount for FOK/FAK BUY. */
  size?: number
  /** Dollar amount for FOK/FAK BUY; shares for FOK/FAK SELL. */
  amount?: number
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK'
  /** GTD expiration, UTC seconds. Effective lifetime = now + 60 + N. */
  expiration?: number
  postOnly?: boolean
}

export interface SigningConfig {
  privateKey: string
  funderAddress: string
  signatureType: number
  creds: { apiKey: string; secret: string; passphrase: string }
  clobUrl: string
}

export interface PlaceOrderResult {
  orderID?: string
  status?: string
  [key: string]: unknown
}

let sdkState: { available: boolean; checked: boolean } = { available: false, checked: false }

/** Whether the optional official SDK is resolvable in this deployment. */
export function sdkAvailable(): boolean {
  return sdkState.available
}

async function loadSdk(): Promise<any | undefined> {
  try {
    // Non-literal specifier: the SDK is an OPTIONAL dependency; TS must not
    // statically resolve it and the runtime must fail soft when absent.
    const specifier = '@polymarket/clob-client'
    return await import(specifier)
  } catch {
    sdkState = { available: false, checked: true }
    return undefined
  }
}

/**
 * Place an order through the official SDK. `tickSize` and `negRisk` come from
 * the market (the caller fetches them via the CLOB client first).
 */
export async function placeOrder(
  config: SigningConfig,
  args: PlaceOrderArgs,
  marketMeta: { tickSize: string; negRisk: boolean },
): Promise<PlaceOrderResult> {
  const sdk = await loadSdk()
  if (sdk === undefined) {
    throw new Error(
      'Order signing requires the official SDK. Install @polymarket/clob-client (with ethers v5) '
      + 'into the DSH profile, e.g. `dsh plugin --profile <name> add @polymarket/clob-client`, '
      + 'and configure trading.privateKey + trading.funderAddress. '
      + 'See knowledge/authentication.md for the L1→L2 credential flow.',
    )
  }
  sdkState = { available: true, checked: true }
  const { ClobClient, Side, OrderType } = sdk
  const ethersSpecifier = 'ethers'
  const { Wallet } = (await import(/* @vite-ignore */ ethersSpecifier)) as { Wallet: new (privateKey: string) => unknown }
  const wallet = new Wallet(config.privateKey)
  const client = new ClobClient(
    config.clobUrl,
    137,
    wallet,
    { key: config.creds.apiKey, secret: config.creds.secret, passphrase: config.creds.passphrase },
    config.signatureType,
    config.funderAddress,
  )
  const orderArgs: Record<string, unknown> = {
    tokenID: args.tokenId,
    price: args.price,
    side: args.side === 'BUY' ? Side.BUY : Side.SELL,
  }
  if (args.size !== undefined) orderArgs.size = args.size
  if (args.amount !== undefined) orderArgs.amount = args.amount
  if (args.expiration !== undefined) orderArgs.expiration = args.expiration

  const options = { tickSize: marketMeta.tickSize, negRisk: marketMeta.negRisk }
  const orderType = { GTC: OrderType.GTC, GTD: OrderType.GTD, FOK: OrderType.FOK, FAK: OrderType.FAK }[args.orderType]

  if (args.orderType === 'FOK' || args.orderType === 'FAK') {
    const response = await client.createAndPostMarketOrder(orderArgs, options, orderType)
    return response as PlaceOrderResult
  }
  const response = await client.createAndPostOrder(orderArgs, options, orderType, args.postOnly ?? false)
  return response as PlaceOrderResult
}

/** Derive (or create) L2 API credentials from a private key via the SDK. */
export async function deriveApiCredentials(
  privateKey: string,
  clobUrl: string,
): Promise<{ apiKey: string; secret: string; passphrase: string }> {
  const sdk = await loadSdk()
  if (sdk === undefined) {
    throw new Error(
      'Credential derivation requires @polymarket/clob-client (with ethers v5). '
      + 'Alternatively create credentials once with py-clob-client and configure them statically.',
    )
  }
  sdkState = { available: true, checked: true }
  const { ClobClient } = sdk
  const ethersSpecifier = 'ethers'
  const { Wallet } = (await import(/* @vite-ignore */ ethersSpecifier)) as { Wallet: new (privateKey: string) => unknown }
  const client = new ClobClient(clobUrl, 137, new Wallet(privateKey))
  const creds = await client.createOrDeriveApiKey()
  return { apiKey: creds.key ?? creds.apiKey, secret: creds.secret, passphrase: creds.passphrase }
}
