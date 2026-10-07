# API Endpoints — Complete Verified Inventory

> New module: compiled from the official OpenAPI specs (docs.polymarket.com/api-spec/) and live endpoint verification. Supersedes any partial lists in older modules.
> Part of the dsh-polymarket-knowhow distribution, which adapts atompilot/polymarket-skill (MIT); this module is original to this distribution.

Polymarket exposes seven REST APIs plus several WebSocket channels. Chain ID is **137** (Polygon PoS).

| API | Base URL | Auth | Ops |
|-----|----------|------|-----|
| Gamma (Markets) | `https://gamma-api.polymarket.com` | none | 42 |
| CLOB | `https://clob.polymarket.com` (+ staging `clob-staging`) | L2 for trade/account | 66 |
| Data API | `https://data-api.polymarket.com` | none (reads) | 20 |
| Perps | `https://api.perpetuals.polymarket.com` | POLYMARKET-PROXY + POLYMARKET-SECRET | 56 |
| Combos RFQ | `https://combos-rfq-api.polymarket.com` | CLOB L2 for maker ops | 4 |
| Bridge | `https://bridge.polymarket.com` | none | 5 |
| Relayer | `https://relayer-v2.polymarket.com` | builder headers for submit | 7 |
| Geoblock check | `https://polymarket.com/api/geoblock` | none | 1 |

## Gamma (Markets) API

Core reads:
- `GET /events` — filters: `active`, `closed`, `archived`, `slug`, `tag_id[]`, `series_id[]`, `order`, `ascending`, `limit` (≤500), `offset`
- `GET /events/keyset` — cursor pagination: `after_cursor`, `limit` (≤500), `live`, `title_search`, `tag_id[]`, `tag_match`, `series_id[]`, `game_id[]`
- `GET /events/{id}` · `GET /events/slug/{slug}` · `GET /events/{id}/tags`
- `GET /markets` — id filters are FLAT repeated keys: `condition_ids=<id>` / `clob_token_ids=<id>` (live-verified 2026-10-07: the bracket `condition_ids[]=` spelling is silently IGNORED — unfiltered rows come back). The server defaults to `closed=false`: pass `closed=true` to include resolved markets (a just-closed market still carries its `feeSchedule`)
- `GET /markets/keyset` — cursor pagination (`limit` ≤100, `decimalized`, `rfq_enabled`)
- `GET /markets/{id}` · `GET /markets/slug/{slug}` · `GET /markets/{id}/tags` · `GET /markets/{id}/description`
- `POST /markets/abridged` and `POST /markets/information` — POST-body filter queries
- `GET /public-search?q=` — search events/markets/tags/profiles; params `events_status=active|closed`, `limit_per_type`, `page`
- `GET /tags` · `GET /tags/{id}` · `GET /tags/slug/{slug}` · related-tags variants (`/related-tags`, `/related-tags/tags`)
- `GET /series` · `GET /series/{id}` · `GET /series-summary/{id}` · `GET /series-summary/slug/{slug}`
- `GET /sports` · `GET /sports/market-types` · `GET /teams` · `GET /teams/{id}`
- `GET /events/results` (sport results) · `GET /events/pagination` (legacy) · `GET /events/creators` · comment/tweet counters · `GET /status`

**Sort fields (live-verified, camelCase, NO underscores):** events accept `volume24hr`, `liquidity`, `endDate`, `competitive`, `closedTime`; markets additionally `volume`, `startDate`, `spread`, `lastTradePrice`, `bestBid`, `bestAsk`. The underscore form `volume_24hr` returns HTTP 422 "order fields are not valid" (older docs are wrong).

**Protocol V2 fields on market objects:** every market carries `version` (`"v1"`/`"v2"`); V2 markets expose `positionIds` (plain decimal-string array) instead of relying on `clobTokenIds`, and `resolutionStatus` (`inactive|active|resolved`) instead of `umaResolutionStatus`. Pick the outcome id at your outcome's index; see concepts.md for the V1↔V2 mapping.

## Data API (v2)

**Data API v1 retires on 2026-10-24** — every route below is the v2 replacement (same base host `https://data-api.polymarket.com`; until that date the v1 routes still answer). v2 conventions, live-verified against production (2026-10-05):

- **Envelope**: every response is `{ "data": …, "pagination": … }`; a miss is `data: null` or an empty list, never an error.
- **Pagination is cursor-only**: pass `?cursor=` from `pagination.next_cursor` (`offset` is rejected with a hint error). The pagination echo still carries `limit/offset/has_more/next_cursor`.
- **Fields are snake_case** (`proxy_wallet`, `condition_id`, `token_id`, `usdc_size`…); request params accept both spellings, but prefer snake_case.
- **Market selection is `condition`** (aliases `condition_id`/`conditionId`; max 20 comma-joined ids) — the v1 `market` param name is rejected.
- **Position lifecycle**: `status` ∈ `OPEN|REDEEMABLE|REDEEMABLE_LOST|MERGEABLE|CLOSED`, and every position row carries `redeemable`/`mergeable` flags.
- Notable renames: `asset` → `token_id`; leaderboard rows `proxyWallet` → `user_id` (+ `user_name`, `rank`, `pnl`, `volume`); positions `size` → `current_size`, `avgPrice` → `avg_price`, `initialValue` → `entry_cost_usdc`, `cashPnl` → `total_pnl`, `curPrice` → `current_price`.

Routes:

- `GET /v2/positions?user=&condition=&status=&size_threshold=&redeemable=&mergeable=&archived=&sort_by=&sort_direction=&limit=&cursor=` — open positions by default; `status=CLOSED` replaces `/closed-positions`; `condition` without `user` replaces `/v1/market-positions`; `sort_by` ∈ `current_value|total_pnl|realized_pnl|unrealized_pnl` (case-insensitive; the v1 values CURRENT/CASH/TIME/CASHPNL/PERCENTPNL are rejected)
- `GET /v2/trades?user=&condition=&taker_only=&filter_type=CASH|TOKENS&filter_amount=&side=&limit=&cursor=`
- `GET /v2/activity?user=&type=&start=&end=&side=&condition=&limit=&cursor=` — TRADE|SPLIT|MERGE|REDEEM|CONVERSION|REWARD; includes per-outcome REDEEM rows. **`type` accepts exactly ONE value per request** (live-verified 2026-10-05): the plain single value is the only form that filters; repeated keys (`type=A&type=B`) fail with 400 "duplicate field `type`", and the bracket (`type[]=`) and CSV (`type=A,B`) forms return 200 with the filter SILENTLY IGNORED — issue one call per type
- `GET /v2/holders?condition=<full condition id>&limit=&include_pnl=` — top holders per outcome token; `include_pnl=true` adds entry/PnL per holder
- `GET /v2/oi?global=true` OR `condition=` OR `slug=` OR `event=<eventId>`
- `GET /v2/live-volume?id=<eventId>` — `data.taker_volume_total` + per-market `conditions[]`
- `GET /v2/value?user=` — `data: { proxy_wallet, value }` (object, not array)
- `GET /v2/user-stats?user=` — replaces `/traded`: `data.trades` is the distinct-market count, plus `biggest_win`, `join_date`, and the full `all_time_pnl` breakdown. (The official migration guide says unknown users return `data: null`, but production 2026-10-05 returned a zeroed object — `trades: 0`, `all_time_pnl: null` — for an inactive wallet; treat "no activity" as zeroed/null both.)
- `GET /v2/leaderboard?time_period=DAY|WEEK|MONTH|ALL&limit=&cursor=`
- `GET /v2/user-volume?user=` · `GET /v2/biggest-winners?window=` — analytics reads (params not yet live-verified)
- `GET /v2/resolutions?condition_id=` — status `inactive|active|posed|resolved` (production also emits `posed` for pending proposals), `payouts[]` in 6-decimal base units; only trust `status:"resolved"` rows
- `GET /v2/approvals?user=` — token approval state across Polymarket contracts
- `GET /v2/status` — data freshness: pipeline age, lagging mechanisms, ingestion cursors
- `GET /v2/activity/combos` · `GET /v2/positions/combos` — combo-market activity/positions (cursor pagination)
- `GET /v1/accounting/snapshot` — the ONLY surviving v1 route (no v2 counterpart, documented exception)
- `GET /` — health check
- `GET /v2/user-pnl?user=&interval=&fidelity=` — PnL time series (`data.points[]`); `fidelity` is a duration enum `1d|18h|12h|3h|1h` (minutes values are rejected with 400)

**Retired with no v2 counterpart**: `/other` (augmented neg-risk "Other" size) and `/revisions`. Both return 404 on `/v2/*` — drop them from integrations.

## CLOB REST

Public market data:
- `GET /book?token_id=` · `POST /books` body `[{"token_id":"…"}]` — FLAT array, ≤500 entries (live-verified; a `[{params:[…]}]` wrapper silently returns `[]`) · also `GET /books?token_ids=`
- `GET /price?token_id=&side=BUY|SELL` · `POST /prices` body flat `[{"token_id":"…","side":"SELL"}]` → map of token → `{BUY: price}` (spec enum uppercase; production accepts both cases — live-verified)
- `GET /midpoint` · `GET /midpoints` · `POST /midpoints`; `GET /spread` · `POST /spreads`
- `GET /last-trade-price?token_id=` · `GET/POST /last-trades-prices`
- `GET /prices-history?market=<token>&interval=max|all|1m|1w|1d|6h|1h&fidelity=<minutes>` or `startTs`/`endTs` unix seconds (mutually exclusive with interval)
- `POST /batch-prices-history` body `{markets[≤20], start_ts, end_ts, interval, fidelity}`
- `GET /tick-size?token_id=` → `{minimum_tick_size}` · `GET /neg-risk?token_id=` → `{neg_risk}`
- `GET /markets-by-token/{token_id}` — resolve token → condition/market
- `GET /clob-markets/{condition_id}` — CLOB-side market info
- `GET /simplified-markets` · `/sampling-simplified-markets` · `/sampling-markets` (paginated by `next_cursor`)
- `GET /fee-rate[/{token_id}]` → `{"base_fee": 1000}` — a **legacy cap field, NOT the taker fee**; the live taker-fee parameters are the Gamma market's `feesEnabled`/`feeType`/`feeSchedule` (see fees.md) · `GET /rewards/markets/current` · `POST /markets/live-activity` + `GET /markets/live-activity/{condition_id}`
- `GET /time` — server time

Authenticated (L2 headers):
- Orders: `GET /data/orders` (`market`, `asset_id`, `id`), `GET /data/order/{orderID}`, `POST /order`, `POST /orders` (≤15). Order responses return `tradeIDs` (the pre-2026-07 `transactionHashes` field is gone)
- Trades: `GET /data/trades` (`market`, `asset_id`, `before`, `after`)
- Cancels: `DELETE /order` body `{orderID}`, `DELETE /orders` body `[ids]` (≤1000 since 2026-06), `DELETE /cancel-all`, `DELETE /cancel-market-orders` body `{market[, asset_id]}`
- Heartbeat: `POST /heartbeats` body `{heartbeat_id}` (also `POST /v1/heartbeats`)
- Balance: `GET /balance-allowance?asset_type=COLLATERAL|CONDITIONAL|CONDITIONAL-V2&token_id=&signature_type=`, refresh via `GET /balance-allowance/update` — **V2 positions use `CONDITIONAL-V2` with the V2 asset id; allowances are keyed by spender (check the ExchangeV3 entry)**
- Keys: `GET /auth/api-keys`, `POST /auth/api-key`, `DELETE /auth/api-key`, `GET /auth/derive-api-key` (L1 headers)
- Builder keys: `GET|POST|DELETE /auth/builder-api-key` (L2); builder attribution uses `POLY_BUILDER_*` headers
- Status: `GET /auth/ban-status/closed-only`, `GET|POST /orders-scoring`, `GET /order-scoring`, notifications `GET|DELETE /notifications`
- Rewards: `GET /rewards/user`, `/rewards/user/markets`, `/rewards/user/percentages`, `/rewards/user/total`, `/rebates/current`

## Bridge / Relayer

- Bridge: `GET /supported-assets`, `POST /deposit` (create deposit addresses), `POST /quote`, `GET /status/{address}`, `POST /withdraw`
- Relayer: `GET /deployed?address=` (spec param; the legacy `user=` spelling is superseded), `GET /nonce`, `GET /relay-payload`, `POST /submit` (builder headers), `GET /transaction?id=`, `GET /transactions?user=`, `GET /relayer/api/keys` (headers `RELAYER_API_KEY` + `RELAYER_API_KEY_ADDRESS`)

## Contracts (Polygon mainnet — verify at docs.polymarket.com/resources/contracts)

The official contracts page changed in 2026; the CURRENT addresses are:

| Contract | Current address |
|---|---|
| CTF Exchange (V1/CTF) | `0xE111180000d2663C0091e4f400237545B87B996B` |
| Neg Risk CTF Exchange (V1/CTF) | `0xe2222d279d744050d28e00520010520000310F59` |
| Neg Risk Adapter (CLOB v1) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` (deprecated) |
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| pUSD CollateralToken proxy | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFb` |
| **PositionManager (V2)** | `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF` |
| **Router (V2)** | `0x12121212006e4CD160D18e3f00711DA5c3372600` |
| **ExchangeV3 (V2)** | `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` |
| **AutoRedeemer (V2)** | `0xa1200000d0002264C9a1698e001292D00E1b00af` |
| **NegRiskModule (V2)** | `0x200000900045e3B6259600682756002200028933` |
| CollateralOnramp / Offramp | `0x93070a847efEf7F70739046A929D47a521F5B8ee` / `0x2957922Eb93258b93368531d39fAcCA3B4dC5854` |
| Gnosis Safe Factory / Proxy Factory | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` / `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` |
| UMA Adapter | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` |

Older listings (CTF Exchange `0x4bFb41d5…`, NegRisk Exchange `0xC5d563A3…`, USDC.e as collateral) are superseded — treat pre-2026 material citing them as historical.

## Response quirks worth knowing

- Gamma market objects return `clobTokenIds`, `outcomes`, `outcomePrices` as **JSON-encoded strings** in some endpoints — parse defensively.
- `/events` embeds full markets arrays unless you use keyset mode or prune.
- Batch endpoints (`/books`, `/prices`, `/midpoints`, `/spreads`, `/last-trades-prices`) take FLAT arrays of `{token_id[, side]}` objects; the older `{params:[…]}` wrapper returns empty results.
- Rate-limit budget headers on trading routes: `Poly-RateLimit-Remaining|Reset|Tier`.
