> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Polymarket Skill

## When to use this skill

Use this skill when the user asks about or needs to build:
- Polymarket API authentication (L1/L2, API keys, HMAC signing)
- Placing or managing orders (limit, market, GTC, GTD, FOK, FAK, batch, cancel) on V1 (CTF) and Protocol V2 markets
- Reading orderbook data (prices, spreads, midpoints, depth)
- Market data fetching (events, markets, by slug, by tag, pagination; Data API v2)
- WebSocket subscriptions (market channel, user channel, sports, PolyBolt reference prices)
- CTF operations (split, merge, redeem — CTF and V2 Router)
- Negative risk markets (multi-outcome, conversion, augmented neg risk)
- Bridge operations (deposits, withdrawals, multi-chain)
- Gasless transactions (relayer client, order attribution)
- Builder program integration (order attribution, API keys, tiers)
- Polymarket SDK usage (unified TypeScript `@polymarket/client` / Python `polymarket-client`)

## API Configuration

| API | Base URL | Auth | Purpose |
|-----|----------|------|---------|
| CLOB | `https://clob.polymarket.com` | L2 for trade endpoints | Orderbook, prices, order submission |
| Gamma / Data | `https://gamma-api.polymarket.com` | None | Events, markets, search |
| Data API (v2) | `https://data-api.polymarket.com` | None | Positions, trades, activity, user data (`/v2/*`; v1 retires 2026-10-24) |
| WebSocket (Market) | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | None | Real-time orderbook |
| WebSocket (User) | `wss://ws-subscriptions-clob.polymarket.com/ws/user` | API creds in message | Trade/order updates |
| WebSocket (Sports) | `wss://sports-api.polymarket.com/ws` | None | Live scores |
| WebSocket (PolyBolt) | `wss://ws-live-v2.polymarket.com/ws` | CLOB creds (`op: auth`) | Reference prices (crypto/equity/TWAP) |
| Relayer | `https://relayer-v2.polymarket.com/` | Builder headers | Gasless transactions |
| Bridge | `https://bridge.polymarket.com` | None | Deposits/withdrawals |
| Perps | `https://api.perpetuals.polymarket.com` | POLYMARKET-PROXY/SECRET | Perpetual futures |
| Combos RFQ | `https://combos-rfq-api.polymarket.com` | CLOB L2 (maker ops) | Combination markets |
| Geoblock check | `https://polymarket.com/api/geoblock` | None | Region restriction check |

## Contract Addresses (Polygon — current official listing)

V1/CTF system:

| Contract | Address |
|----------|---------|
| CTF (Conditional Tokens) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTF Exchange | `0xE111180000d2663C0091e4f400237545B87B996B` |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` |
| Neg Risk Adapter (CLOB v1) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` (deprecated) |

Protocol V2 system:

| Contract | Address |
|----------|---------|
| pUSD CollateralToken proxy | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFb` |
| PositionManager | `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF` |
| Router (split/merge/redeem) | `0x12121212006e4CD160D18e3f00711DA5c3372600` |
| ExchangeV3 (EIP-712 version "3") | `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` |
| AutoRedeemer | `0xa1200000d0002264C9a1698e001292D00E1b00af` |
| NegRiskModule | `0x200000900045e3B6259600682756002200028933` |

> The exchange addresses above supersede the pre-2026 listings (`0x4bFb41d5…`, `0xC5d563A3…`) still found in older guides. Always re-verify at docs.polymarket.com/resources/contracts.

## Client Setup

### TypeScript — unified SDK (recommended, V1 + V2)
```typescript
import { createSecureClient, OrderSide } from "@polymarket/client";
import { privateKey } from "@polymarket/client/viem"; // requires viem

// Auto-derives L2 credentials and resolves the account wallet (funder).
const client = await createSecureClient({
  wallet: process.env.POLYMARKET_WALLET_ADDRESS, // omit to use the signer's Deposit Wallet
  signer: privateKey(process.env.POLYMARKET_PRIVATE_KEY),
  // resume with stored creds instead of deriving: credentials: { key, secret, passphrase }
});

// Asset ids: V1 markets → outcome.tokenId, V2 markets → outcome.positionId
const assetId = market.version === "v2" ? market.outcomes.yes.positionId : market.outcomes.yes.tokenId;

// GTC limit (GTD: add expiration ≥3 min ahead; postOnly supported)
await client.placeLimitOrder({ assetId, side: OrderSide.BUY, price: "0.50", size: "10" });
// Marketable FOK/FAK: BUY takes a pUSD `amount`, SELL takes `shares`
await client.placeMarketOrder({ assetId, side: OrderSide.BUY, amount: "10" });
```
Tick size, neg-risk and fee schedule resolve automatically — there are no `getTickSize`/`getNegRisk` calls anymore.

### Python
```python
from polymarket import AsyncSecureClient

client = await AsyncSecureClient.create(
    private_key=os.environ["POLYMARKET_PRIVATE_KEY"],
    wallet=os.environ["POLYMARKET_WALLET_ADDRESS"],
)
asset_id = yes.position_id if market.version == "v2" else yes.token_id
await client.place_limit_order(asset_id=asset_id, side="BUY", price="0.50", size="10")
```

### Legacy standalone clients (V1/CTF only — superseded)
`@polymarket/clob-client` + ethers v5 and `py-clob-client` predate Protocol V2 and cannot sign V2 orders; migrate to the unified SDK (see the official migration guide `docs.polymarket.com/migrate/clob-sdk-to-unified-sdk`).

## Quick Reference: Order Types

| Type | Behavior | Use Case |
|------|----------|----------|
| **GTC** | Rests on book until filled or cancelled | Default limit orders |
| **GTD** | Active until expiration (UTC seconds). Min = `now + 60 + N` | Auto-expire before events |
| **FOK** | Fill entirely immediately or cancel | All-or-nothing market orders |
| **FAK** | Fill what's available, cancel rest | Partial-fill market orders |

- FOK/FAK BUY: `amount` = dollar amount to spend
- FOK/FAK SELL: `amount` = number of shares to sell
- Post-only: GTC/GTD only — rejected if would cross spread

## Quick Reference: Signature Types

| Type | Value | Description |
|------|-------|-------------|
| EOA | `0` | Standard Ethereum wallet (MetaMask). Funder is the EOA address and will need POL for gas. |
| POLY_PROXY | `1` | Custom proxy wallet for Magic Link email/Google users who exported PK from Polymarket.com. |
| GNOSIS_SAFE | `2` | Gnosis Safe multisig proxy wallet (most common). Use for any new or returning user. |

## Core Pattern: Place an Order

### TypeScript (unified SDK)
```typescript
const assetId = market.version === "v2" ? outcome.positionId : outcome.tokenId;
const response = await client.placeLimitOrder({
  assetId,
  side: OrderSide.BUY,
  price: "0.50",
  size: "10",       // shares
  // orderType is a limit (GTC) by default; pass expiration (UTC seconds,
  // ≥3 min ahead) for GTD and postOnly: true to avoid crossing the spread
});
if (!response.ok) throw new Error(response.message);
console.log(response.orderId);
```

### Python
```python
response = await client.place_limit_order(asset_id=asset_id, side="BUY", price="0.50", size="10")
print(response.order_id)
```

V2 fill semantics (ExchangeV3, integer base units): `counterAmount = floor(makerAssetFill × takerAmount / makerAmount)`; GTC/GTD BUY targets **shares**, FOK/FAK BUY targets **collateral**; fees add to a BUY's collateral spend and are deducted from a SELL's proceeds.

## Core Pattern: Read Orderbook

### TypeScript
```typescript
// No auth needed
const client = createPublicClient();
const book = await client.fetchOrderBook({ assetId }); // token id or V2 position id
console.log("Best bid:", book.bids[0], "Best ask:", book.asks[0]);

const mid = await client.fetchMidpoint({ assetId });
const spread = await client.fetchSpread({ assetId });
```

### Python
```python
client = PublicClient()
book = client.fetch_order_book(asset_id=asset_id)
mid = client.fetch_midpoint(asset_id=asset_id)
spread = client.fetch_spread(asset_id=asset_id)
```

## Core Pattern: WebSocket Subscribe

```typescript
const ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/market");

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "market",
    assets_ids: ["TOKEN_ID"],
    custom_feature_enabled: true,
  }));
  // Send PING every 10s to keep alive
  setInterval(() => ws.send("PING"), 10_000);
};

ws.onmessage = (event) => {
  if (event.data === "PONG") return;
  const msg = JSON.parse(event.data);
  // msg.event_type: "book" | "price_change" | "last_trade_price" | "tick_size_change" | "best_bid_ask" | "new_market" | "market_resolved"
};
```

## Reference files (load on demand)

Only read these when the task requires deeper detail on a specific topic:

- **Authentication** (L1/L2, builder headers, credential lifecycle): [authentication.md](authentication.md)
- **Order patterns** (GTC/GTD/FOK/FAK, tick sizes, cancel, heartbeat, errors): [order-patterns.md](order-patterns.md)
- **Market data** (Gamma API, Data API, CLOB orderbook, subgraph): [market-data.md](market-data.md)
- **WebSocket** (market/user/sports channels, subscribe, heartbeat): [websocket.md](websocket.md)
- **CTF operations** (split, merge, redeem, neg risk, token IDs): [ctf-operations.md](ctf-operations.md)
- **Bridge** (deposits, withdrawals, supported chains/tokens, status): [bridge.md](bridge.md)
- **Fees** (fee formula, fee tables by market type, SDK auto-handling, REST API manual flow): [fees.md](fees.md)
- **Gasless transactions** (relayer client, wallet deployment, builder setup): [gasless.md](gasless.md)
- **Core concepts** (markets/events, positions/tokens, order lifecycle, resolution, negative risk): [concepts.md](concepts.md)
- **Error codes** (all CLOB API error codes by endpoint, status code reference): [error-codes.md](error-codes.md)
- **Rate limits** (Gamma/Data/CLOB API limits, trading burst+sustained limits): [rate-limits.md](rate-limits.md)
- **Geographic restrictions** (blocked countries, geoblock API, close-only regions): [geoblock.md](geoblock.md)

## Verification status (this plugin)

Every endpoint in these modules was cross-checked against the official OpenAPI specs, the migration guides (docs.polymarket.com/migrate/) and live responses. Notable corrections vs earlier snapshots:

- **0.3.0 (2026-10)**: Data API migrated to `/v2` (v1 retires 2026-10-24): envelope `{data, pagination}`, cursor-only pagination, snake_case fields, `condition` market filter. Gamma exposes `version`/`positionIds`/`resolutionStatus` for Protocol V2; CLOB `balance-allowance` accepts `CONDITIONAL-V2`. Trading path uses the unified `@polymarket/client` SDK (ExchangeV3, domain version "3"). PolyBolt (`wss://ws-live-v2.polymarket.com/ws`) documented for reference prices; RTDS legacy.
- Gamma sort fields are camelCase WITHOUT underscores: `volume24hr`, not `volume_24hr` (the old form now returns HTTP 422).
- Geoblock lives on polymarket.com (`GET https://polymarket.com/api/geoblock`), NOT on data-api.
- Surfaces covered: **Perps** (`api.perpetuals.polymarket.com`), **Combos/RFQ** (`combos-rfq-api.polymarket.com`), **PolyBolt** reference prices.
- Full inventory: see `api-endpoints.md`. Rate limiting also documents per-signer token buckets with `Poly-RateLimit-*` response headers — see `rate-limits.md`.
