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
    tokenId: string;
    side: 'BUY' | 'SELL';
    /** Limit price in [tick, 1-tick]. */
    price: number;
    /** Size in shares for limit orders; dollar amount for FOK/FAK BUY. */
    size?: number;
    /** Dollar amount for FOK/FAK BUY; shares for FOK/FAK SELL. */
    amount?: number;
    orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
    /** GTD expiration, UTC seconds. Effective lifetime = now + 60 + N. */
    expiration?: number;
    postOnly?: boolean;
}
export interface SigningConfig {
    privateKey: string;
    funderAddress: string;
    signatureType: number;
    creds: {
        apiKey: string;
        secret: string;
        passphrase: string;
    };
    clobUrl: string;
}
export interface PlaceOrderResult {
    orderID?: string;
    status?: string;
    [key: string]: unknown;
}
/** Whether the optional official SDK is resolvable in this deployment. */
export declare function sdkAvailable(): boolean;
/**
 * Place an order through the official SDK. `tickSize` and `negRisk` come from
 * the market (the caller fetches them via the CLOB client first).
 */
export declare function placeOrder(config: SigningConfig, args: PlaceOrderArgs, marketMeta: {
    tickSize: string;
    negRisk: boolean;
}): Promise<PlaceOrderResult>;
/** Derive (or create) L2 API credentials from a private key via the SDK. */
export declare function deriveApiCredentials(privateKey: string, clobUrl: string): Promise<{
    apiKey: string;
    secret: string;
    passphrase: string;
}>;
