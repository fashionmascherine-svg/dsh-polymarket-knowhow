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
let sdkState = { available: false, checked: false };
/** Whether the optional official SDK is resolvable in this deployment. */
export function sdkAvailable() {
    return sdkState.available;
}
async function loadSdk() {
    try {
        // Non-literal specifier: the SDK is an OPTIONAL dependency; TS must not
        // statically resolve it and the runtime must fail soft when absent.
        const specifier = '@polymarket/client';
        return await import(specifier);
    }
    catch {
        sdkState = { available: false, checked: true };
        return undefined;
    }
}
const INSTALL_HINT = 'Order signing requires the official unified SDK. Install @polymarket/client (with viem) '
    + 'into the DSH profile, e.g. `dsh plugin --profile <name> add @polymarket/client viem`, '
    + 'then set POLY_PRIVATE_KEY and configure trading.address (the funder wallet). '
    + 'See knowledge/authentication.md for the L1→L2 credential flow.';
/**
 * Map the repo's stored credential shape to the SDK boundary shape:
 * `@polymarket/client` validates `credentials.key` (not `apiKey`) and throws
 * a zod error at construction otherwise (live-verified against 0.12.0).
 */
export function toSdkCredentials(creds) {
    return { key: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase };
}
/**
 * Place an order through the unified SDK. Tick size, neg-risk and the fee
 * schedule are resolved from the market by the SDK itself — the caller does
 * not need market metadata anymore.
 */
export async function placeOrder(config, args) {
    const sdk = await loadSdk();
    if (sdk === undefined) {
        throw new Error(INSTALL_HINT);
    }
    sdkState = { available: true, checked: true };
    const { createSecureClient, OrderSide } = sdk;
    // Non-literal specifier, same reason as above: optional peer module.
    const viemSpecifier = '@polymarket/client/viem';
    const { privateKey: privateKeySigner } = await import(/* @vite-ignore */ viemSpecifier);
    const client = await createSecureClient({
        wallet: config.walletAddress,
        signer: privateKeySigner(config.privateKey),
        ...(config.creds !== undefined ? { credentials: toSdkCredentials(config.creds) } : {}),
    });
    if (args.orderType === 'FOK' || args.orderType === 'FAK') {
        // Market orders: BUY targets a pUSD spend amount, SELL a share amount
        // (`price`, when given, becomes the SELL worst-price floor `minPrice`).
        // Validate locally: String(undefined) would otherwise reach the SDK as
        // the literal "undefined".
        let request;
        if (args.side === 'BUY') {
            const spend = args.amount ?? args.size;
            if (spend === undefined)
                throw new Error('FOK/FAK BUY requires amount (pUSD to spend)');
            request = { assetId: args.assetId, side: OrderSide.BUY, amount: String(spend) };
        }
        else {
            if (args.size === undefined && args.amount === undefined)
                throw new Error('FOK/FAK SELL requires size (shares to sell)');
            request = {
                assetId: args.assetId,
                side: OrderSide.SELL,
                shares: String(args.size ?? args.amount),
                ...(args.price !== undefined ? { minPrice: args.price } : {}),
            };
        }
        const response = await client.placeMarketOrder(request);
        return normalizeOrderResponse(response);
    }
    // Limit orders: GTC by default; a future `expiration` makes it GTD.
    const response = await client.placeLimitOrder({
        assetId: args.assetId,
        side: args.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
        price: args.price,
        size: args.size,
        postOnly: args.postOnly ?? false,
        ...(args.orderType === 'GTD' ? { expiration: args.expiration } : {}),
    });
    return normalizeOrderResponse(response);
}
function normalizeOrderResponse(response) {
    if (response === null || typeof response !== 'object')
        return { raw: response };
    return {
        ok: response.ok !== false,
        orderId: response.orderId ?? response.orderID,
        status: response.status,
        ...response,
    };
}
/**
 * Derive (or create) L2 API credentials from a private key through the SDK's
 * L1 authentication flow, so they can be stored and reused statically.
 */
export async function deriveApiCredentials(privateKey) {
    const sdk = await loadSdk();
    if (sdk === undefined) {
        throw new Error('Credential derivation requires @polymarket/client (with viem). '
            + 'Alternatively create credentials once and configure them statically.');
    }
    sdkState = { available: true, checked: true };
    const { createSecureClient } = sdk;
    const viemSpecifier = '@polymarket/client/viem';
    const { privateKey: privateKeySigner } = await import(/* @vite-ignore */ viemSpecifier);
    const client = await createSecureClient({ signer: privateKeySigner(privateKey) });
    const creds = client.credentials;
    return { apiKey: creds.key ?? creds.apiKey, secret: creds.secret, passphrase: creds.passphrase };
}
