<!-- GENERATED from knowledge/order-patterns.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/order-patterns.md and run npm run sync:claude-skill. -->


> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Order Patterns

All orders on Polymarket are expressed as limit orders. Market orders are limit orders with a marketable price that execute immediately.

## Order Types

| Type | Behavior | Use Case |
|------|----------|----------|
| **GTC** | Good-Til-Cancelled — rests on book until filled or cancelled | Default for limit orders |
| **GTD** | Good-Til-Date — active until expiration timestamp (UTC seconds), unless filled or cancelled first | Auto-expire before known events |
| **FOK** | Fill-Or-Kill — fill entirely immediately or cancel | All-or-nothing market orders |
| **FAK** | Fill-And-Kill — fill what's available, cancel rest | Partial-fill market orders |

## Tick Sizes

Price must conform to the market's tick size or the order is rejected.

| Tick Size | Precision | Example Prices |
|-----------|-----------|----------------|
| `0.1` | 1 decimal | 0.1, 0.2, 0.5 |
| `0.01` | 2 decimals | 0.01, 0.50, 0.99 |
| `0.001` | 3 decimals | 0.001, 0.500, 0.999 |
| `0.0001` | 4 decimals | 0.0001, 0.5000, 0.9999 |

Get tick size: read `market.trading.minimumTickSize` (unified SDK market object) or `minimum_tick_size` on raw Gamma/CLOB market objects; the CLOB route `GET /tick-size?token_id=` also returns it. The unified SDK resolves tick size, neg-risk and fee schedule automatically when placing orders — the legacy `getTickSize`/`getNegRisk` client calls are gone.

## Order Signing Domains (V1 vs V2)

- **V1/CTF orders** settle on CTF Exchange / Neg Risk CTF Exchange: EIP-712 domain `Polymarket CTF Exchange`, version `"2"`, chainId 137.
- **V2 orders** settle on ExchangeV3 (`0xe3333700cA9d93003F00f0F71f8515005F6c00Aa`): same domain name, version **`"3"`**, chainId 137. Keep the CTFExchangeV2 signed-order struct, set `order.tokenId` to the V2 position id and re-sign.

## Limit Order (GTC)

```typescript
// TypeScript — unified SDK (GTC by default; tick size/neg-risk/fees auto-resolved)
const assetId = market.version === "v2" ? outcome.positionId : outcome.tokenId;
const response = await client.placeLimitOrder({
  assetId,
  price: "0.50",
  size: "10",          // shares
  side: OrderSide.BUY,
});
if (!response.ok) throw new Error(response.message);
```

```python
# Python
response = await client.place_limit_order(asset_id=asset_id, price="0.50", size="10", side="BUY")
```

### Two-step (sign then submit)

```typescript
// TypeScript — unified SDK
const signed = await client.createLimitOrder({ assetId, price: "0.50", size: "10", side: OrderSide.BUY });
const response = await client.postOrder(signed); // order type lives on the signed order
```

Legacy standalone clients (`@polymarket/clob-client`, V1/CTF only): `createAndPostOrder({ tokenID, price, size, side }, { tickSize, negRisk }, OrderType.GTC)` / `create_and_post_order(...)`.

## Market Order (FOK / FAK)

- **BUY**: `amount` = pUSD amount to spend
- **SELL**: `shares` = number of shares to sell (with optional `minPrice` slippage floor)
- `orderType` defaults to FAK; pass FOK for all-or-nothing

```typescript
// TypeScript — unified SDK: BUY spends up to 10 pUSD, unfilled remainder is canceled
const response = await client.placeMarketOrder({
  assetId,
  side: OrderSide.BUY,
  amount: "10",           // pUSD spend (SELL uses `shares`)
  orderType: OrderType.FOK,
});
```

```python
# Python
response = await client.place_market_order(asset_id=asset_id, side="BUY", amount="10")
```

Legacy standalone clients: `createAndPostMarketOrder({ tokenID, side, amount, price }, { tickSize, negRisk }, OrderType.FOK)`.

## GTD Order (Expiring)

Legacy standalone clients: expiration = UTC seconds, effective lifetime = `now + 60 + N`.

**Unified SDK**: pass `expiration` (unix seconds, at least 3 minutes in the future) to `placeLimitOrder` — providing it creates a GTD order:

```typescript
const response = await client.placeLimitOrder({
  assetId,
  price: "0.50",
  size: "10",
  side: OrderSide.BUY,
  expiration: Math.floor(Date.now() / 1000) + 3600, // → GTD, expires in 1 hour
});
```

## Post-Only Orders

Guarantee maker status. If order would cross spread, it's rejected (not executed).

```typescript
// TypeScript — unified SDK
const response = await client.placeLimitOrder({ assetId, price: "0.50", size: "10", side: OrderSide.BUY, postOnly: true });
```

- Only works with GTC and GTD
- Rejected if combined with FOK or FAK

## Batch Orders

Up to **15 orders** in a single request (`POST /orders`, wire-level cap unchanged).

```typescript
// TypeScript — unified SDK: sign each order, then post them together
const signedA = await client.createLimitOrder({ assetId, price: "0.48", size: "500", side: OrderSide.BUY });
const signedB = await client.createLimitOrder({ assetId, price: "0.52", size: "500", side: OrderSide.SELL });
const response = await client.postOrders([signedA, signedB]);
```

Legacy standalone clients: `postOrders([{ order, orderType }…])`.

## Cancel Orders

All cancel endpoints require L2 authentication.

```typescript
// TypeScript — unified SDK (request objects, camelCase)
await client.cancelOrder({ orderId: "0xORDER_ID" });                    // single
await client.cancelOrders({ orderIds: ["0xID_1", "0xID_2"] });          // multiple
await client.cancelAll();                                               // all orders
await client.cancelMarketOrders({ conditionId: "0xCONDITION_ID" });     // by market
await client.cancelMarketOrders({ conditionId: "0xCONDITION_ID", assetId: "TOKEN_ID" }); // by token
```

Legacy standalone clients: `cancelOrder("0xID")`, `cancelOrders([...])`, `cancelAll()`, `cancelMarketOrders({ market, asset_id })`. `DELETE /orders` accepts at most 1000 ids (since 2026-06).

```python
# Python
client.cancel(order_id="0xORDER_ID")
client.cancel_orders(["0xID_1", "0xID_2"])
client.cancel_all()
client.cancel_market_orders(
    market="0xCONDITION_ID",
    asset_id="TOKEN_ID",  # optional
)
```

### Onchain Cancellation (fallback)

If the API is unavailable, cancel directly on the Exchange contract by calling `cancelOrder(Order order)` onchain with the full signed order struct. Use the `CTFExchange` or `NegRiskCTFExchange` contract depending on the market type. See [Contract Addresses](/resources/contract-addresses) for addresses.

## Heartbeat

If a valid heartbeat is not received within **10 seconds** (with up to a 5-second buffer), **all of your open orders will be cancelled**.

```typescript
// TypeScript
let heartbeatId = "";
setInterval(async () => {
  const resp = await client.postHeartbeat(heartbeatId);
  heartbeatId = resp.heartbeat_id;
}, 5000);
```

```python
# Python
import time
heartbeat_id = ""
while True:
    resp = client.post_heartbeat(heartbeat_id)
    heartbeat_id = resp["heartbeat_id"]
    time.sleep(5)
```

- First request: use empty string for `heartbeat_id`
- If you send an invalid or expired `heartbeat_id`, the server responds with a `400 Bad Request` and provides the correct `heartbeat_id` in the response

## Error Codes

| Error | Description |
|-------|-------------|
| `INVALID_ORDER_MIN_TICK_SIZE` | Price doesn't conform to the market's tick size |
| `INVALID_ORDER_MIN_SIZE` | Order size is below the minimum threshold |
| `INVALID_ORDER_DUPLICATED` | Identical order has already been placed |
| `INVALID_ORDER_NOT_ENOUGH_BALANCE` | Funder doesn't have sufficient balance or allowance |
| `INVALID_ORDER_EXPIRATION` | Expiration timestamp is in the past |
| `INVALID_ORDER_ERROR` | System error while inserting order |
| `INVALID_POST_ONLY_ORDER_TYPE` | Post-only flag used with a market order type (FOK/FAK) |
| `INVALID_POST_ONLY_ORDER` | Post-only order would cross the book |
| `EXECUTION_ERROR` | System error while executing trade |
| `ORDER_DELAYED` | Order placement delayed due to market conditions |
| `DELAYING_ORDER_ERROR` | System error while delaying order |
| `FOK_ORDER_NOT_FILLED_ERROR` | FOK order couldn't be fully filled |
| `MARKET_NOT_READY` | Market is not yet accepting orders |

## Insert Statuses

| Status | Description |
|--------|-------------|
| `matched` | Order placed and matched with a resting order |
| `live` | Order placed and resting on the book |
| `delayed` | Order is marketable but subject to a matching delay |
| `unmatched` | Order is marketable but failed to delay — placement still successful |

## Trade Statuses

```
MATCHED → MINED → CONFIRMED
    ↓        ↑
RETRYING ───┘
    ↓
  FAILED
```

| Status | Terminal | Description |
|--------|----------|-------------|
| `MATCHED` | No | Matched and sent to the executor service for onchain submission |
| `MINED` | No | Observed as mined on the chain, no finality threshold yet |
| `CONFIRMED` | Yes | Achieved strong probabilistic finality — trade successful |
| `RETRYING` | No | Transaction failed (revert or reorg) — being retried by the operator |
| `FAILED` | Yes | Trade failed permanently and is not being retried |

## Prerequisites

Before placing orders, the funder address must have approved the exchange:
- **Buying (V1)**: pUSD allowance ≥ spend on CTF Exchange / Neg Risk CTF Exchange. **Buying (V2)**: pUSD `approve(EXCHANGE_V3, amount)` covering collateral + fees.
- **Selling (V1)**: conditional-token allowance ≥ sell amount on the exchange. **Selling (V2)**: `setApprovalForAll(EXCHANGE_V3, true)` on PositionManager.

The unified SDK handles this automatically: `SecureClient` detects missing allowances, approves, refreshes and retries during order placement; `client.setupTradingApprovals()` pre-approves every V1+V2 trading contract (idempotent).

**V2 fill math** (integer base units, maker's signed amounts): `counterAmount = floor(makerAssetFill × takerAmount / makerAmount)` where `makerAssetFill` is collateral for BUY, shares for SELL. ExchangeV3 reduces a BUY's remaining collateral budget by actual spend. Fees: BUY adds to collateral spend, SELL is deducted from proceeds.

Max order size = `balance - sum(openOrderSize - filledAmount)`

## Sports Markets

- Outstanding limit orders auto-cancelled when game begins
- Marketable orders have 3-second placement delay
- Game start times can shift — monitor accordingly
