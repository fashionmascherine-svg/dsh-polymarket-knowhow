
> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Market Data

Four sources for market data: **Gamma API** (events, markets, search), **Data API** (trades, positions, user data), **CLOB** (orderbook, prices), and **Subgraph** (onchain queries).

## Gamma API

Base URL: `https://gamma-api.polymarket.com` — no auth required.

### Events Endpoint

```bash
# All active events
GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100

# By slug (from polymarket.com/event/{slug})
GET https://gamma-api.polymarket.com/events?slug=fed-decision-in-october

# By tag
GET https://gamma-api.polymarket.com/events?tag_id=100381&limit=10&active=true&closed=false

# By series (sports)
GET https://gamma-api.polymarket.com/events?series_id=10345&active=true&closed=false

# Sorted by volume
GET https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=100
```

### Markets Endpoint

```bash
# By slug
GET https://gamma-api.polymarket.com/markets?slug=fed-decision-in-october
```

### Sort Parameters

> **CORRECTED (verified live):** sort values are camelCase WITHOUT underscores. Valid on /events and /markets: `volume24hr`, `liquidity`, `endDate`, `competitive`, `closedTime`; markets additionally accept `volume`, `startDate`, `spread`, `lastTradePrice`, `bestBid`, `bestAsk`. The underscore forms listed in older docs return HTTP 422 "order fields are not valid".

| Parameter | Values |
|-----------|--------|
| `order` | `volume24hr`, `volume`, `liquidity`, `startDate`, `endDate`, `competitive`, `closedTime`, `spread`*, `lastTradePrice`* (*markets only) |
| `ascending` | `true` / `false` (default: `false`) |
| `active` | `true` / `false` |
| `closed` | `true` / `false` |
| `limit` | 1–500 (default: 20) |
| `offset` | Pagination offset |

### Pagination

```bash
# Page 1
GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&offset=0

# Page 2
GET https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&offset=50
```

Response includes `has_more: true/false`. Increment offset by limit until `has_more` is `false`.

### Tags & Sports

```bash
# Discover tags
GET https://gamma-api.polymarket.com/tags

# Sports metadata
GET https://gamma-api.polymarket.com/sports
```

## Data API (v2)

Base URL: `https://data-api.polymarket.com` — no auth required. **v1 retires on 2026-10-24**: every read lives on `/v2/*` with a `{data, pagination}` envelope, cursor-only pagination and snake_case fields; market filtering uses `condition` (≤20 comma-joined ids). Full route inventory in api-endpoints.md.

```bash
# Trades for one market (cursor comes from pagination.next_cursor)
curl "https://data-api.polymarket.com/v2/trades?condition=0x…&limit=50"

# Open positions for a wallet (status=CLOSED replaces the old /closed-positions)
curl "https://data-api.polymarket.com/v2/positions?user=0x…&status=OPEN&limit=20"
```

## CLOB Orderbook

Base URL: `https://clob.polymarket.com` — no auth for read endpoints. Asset ids: CTF token ids (V1 markets) and Protocol V2 position ids are interchangeable inputs on every read route. The unified SDK calls are shown; the legacy `@polymarket/clob-client` getters (`getOrderBook`…) are superseded.

### Get Orderbook

```typescript
// TypeScript (unified SDK)
import { createPublicClient } from "@polymarket/client";
const client = createPublicClient();
const book = await client.fetchOrderBook({ assetId });
// { bids: [{price, size}...], asks: [{price, size}...], tick_size, min_order_size, neg_risk }
```

```bash
# REST
curl "https://clob.polymarket.com/book?token_id=TOKEN_ID"
```

### Prices

```typescript
const buyPrice = await client.fetchPrice({ assetId, side: "BUY" });   // best ask
const sellPrice = await client.fetchPrice({ assetId, side: "SELL" }); // best bid
```

```bash
curl "https://clob.polymarket.com/price?token_id=TOKEN_ID&side=BUY"
```

### Midpoint

```typescript
const mid = await client.fetchMidpoint({ assetId });  // { mid: "0.50" }
```

If bid-ask spread > $0.10, Polymarket UI shows last traded price instead of midpoint.

### Spread

```typescript
const spread = await client.fetchSpread({ assetId });  // { spread: "0.04" }
```

### Last Trade Price

```typescript
const last = await client.fetchLastTradePrice({ assetId });  // { price, side }
```

### Price History

```typescript
const history = await client.fetchPriceHistory({
  assetId,
  interval: PriceHistoryInterval.ONE_DAY,
  fidelity: 60,  // data points every 60 minutes
});
// Each entry: { t: timestamp, p: price }
```

| Interval | Description |
|----------|-------------|
| `1h` | Last hour |
| `6h` | Last 6 hours |
| `1d` | Last day |
| `1w` | Last week |
| `1m` | Last month |
| `max` | All available |

Use `startTs`/`endTs` for absolute ranges (mutually exclusive with `interval`).

### Estimate Fill Price

Walk the orderbook to estimate slippage for a given order size:

```typescript
const price = await client.estimateMarketPrice({
  assetId, side: OrderSide.BUY, amount: 500, orderType: "FOK",
});
```

### Batch Requests

All orderbook queries have batch variants (up to 500 tokens):

| Single | Batch | REST |
|--------|-------|------|
| `fetchOrderBook()` | `fetchOrderBooks()` | `POST /books` |
| `fetchPrice()` | `fetchPrices()` | `POST /prices` |
| `fetchMidpoint()` | `fetchMidpoints()` | `POST /midpoints` |
| `fetchSpread()` | `fetchSpreads()` | `POST /spreads` |
| `fetchLastTradePrice()` | `fetchLastTradePrices()` | — |

```typescript
const prices = await client.fetchPrices([
  { assetId: "TOKEN_A", side: OrderSide.BUY },
  { assetId: "TOKEN_B", side: OrderSide.BUY },
]);
```

## Key Market Fields

| Field | Description |
|-------|-------------|
| `tokenID` / `asset_id` | ERC1155 token ID for an outcome |
| `conditionID` / `market` | Condition ID — identifies the market |
| `questionID` | Hash of UMA ancillary data |
| `neg_risk` | `true` for multi-outcome events |
| `minimum_tick_size` | Minimum price increment |
| `enableOrderBook` | Whether orderbook is active |
| `slug` | URL-friendly identifier |
| `tokens` | Array of `{ token_id, outcome }` for both outcomes |

## Subgraph (Onchain Data)

GraphQL queries via Goldsky-hosted subgraphs:

| Subgraph | Description |
|----------|-------------|
| Positions | User token balances |
| Orders | Order book and trade events |
| Activity | Splits, merges, redemptions |
| Open Interest | Market and global OI |
| PNL | User position P&L |

```bash
curl -X POST \
  https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn \
  -H "Content-Type: application/json" \
  -d '{"query": "query { orderbooks { id tradesQuantity } }"}'
```

## Fetching Strategy

1. **Specific market**: fetch by slug — `GET https://gamma-api.polymarket.com/events?slug=...`
2. **Category browsing**: filter by tag — `GET https://gamma-api.polymarket.com/events?tag_id=...`
3. **All active markets**: paginate events — `GET https://gamma-api.polymarket.com/events?active=true&closed=false`
4. **Always include** `active=true&closed=false` unless you need historical data
5. **Events > Markets**: events contain their markets, reducing API calls
