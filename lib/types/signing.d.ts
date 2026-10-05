/**
 * Optional order-signing integration via the official unified SDK
 * `@polymarket/client` (>= 0.12.0 — Protocol V2 capable).
 *
 * Placing an order requires an EIP-712 signature over the exchange order
 * struct. Rather than re-implementing wallet cryptography (and risking
 * signature drift with the on-chain contracts), this module lazily loads the
 * unified SDK when it is resolvable and delegates order creation to it. The
 * unified SDK routes V1/CTF token ids and Protocol V2 position ids through
 * the same `assetId`, resolves tick size / neg-risk / fee schedule from the
 * market automatically, and settles V2 markets through ExchangeV3 (EIP-712
 * domain version "3"). When the SDK is not installed, the caller gets an
 * actionable error.
 *
 * To enable: add `@polymarket/client` (and `viem`) to your profile, e.g.
 * `dsh plugin --profile <name> add @polymarket/client viem`, then configure
 * trading credentials + private key. Replaces the retired
 * `@polymarket/clob-client` integration (no Protocol V2 support).
 */
export interface PlaceOrderArgs {
    /** CTF token id (V1 markets) or Protocol V2 position id — the unified `assetId`. */
    assetId: string;
    side: 'BUY' | 'SELL';
    /** Limit price in [tick, 1-tick]. Required for GTC/GTD (validated by the caller); on FOK/FAK SELL it is forwarded as the worst-price `minPrice`; BUY market orders have no price cap in the SDK. */
    price?: number;
    /** Size in shares for limit orders; shares for FOK/FAK SELL. */
    size?: number;
    /** Dollar amount for FOK/FAK BUY (pUSD spend). Ignored for SELL market orders — use `size`. */
    amount?: number;
    orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
    /** GTD expiration, UTC seconds. Must be ≥3 minutes ahead; creates a GTD order. */
    expiration?: number;
    postOnly?: boolean;
}
export interface SigningConfig {
    privateKey: string;
    /** Account/funder wallet: EOA address, Poly proxy/Safe, or Deposit Wallet. */
    walletAddress: string;
    /** Stored L2 credentials; when omitted the SDK derives fresh ones via L1. */
    creds?: {
        apiKey: string;
        secret: string;
        passphrase: string;
    };
}
export interface PlaceOrderResult {
    ok?: boolean;
    orderId?: string;
    status?: string;
    [key: string]: unknown;
}
/** Whether the optional official SDK is resolvable in this deployment. */
export declare function sdkAvailable(): boolean;
/**
 * Map the repo's stored credential shape to the SDK boundary shape:
 * `@polymarket/client` validates `credentials.key` (not `apiKey`) and throws
 * a zod error at construction otherwise (live-verified against 0.12.0).
 */
export declare function toSdkCredentials(creds: {
    apiKey: string;
    secret: string;
    passphrase: string;
}): {
    key: string;
    secret: string;
    passphrase: string;
};
/**
 * Place an order through the unified SDK. Tick size, neg-risk and the fee
 * schedule are resolved from the market by the SDK itself — the caller does
 * not need market metadata anymore.
 */
export declare function placeOrder(config: SigningConfig, args: PlaceOrderArgs): Promise<PlaceOrderResult>;
/**
 * Derive (or create) L2 API credentials from a private key through the SDK's
 * L1 authentication flow, so they can be stored and reused statically.
 */
export declare function deriveApiCredentials(privateKey: string): Promise<{
    apiKey: string;
    secret: string;
    passphrase: string;
}>;
