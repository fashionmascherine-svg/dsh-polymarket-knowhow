<!-- GENERATED from knowledge/api-endpoints.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/api-endpoints.md and run npm run sync:claude-skill. -->

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
- `GET /markets` — plus filters `condition_ids[]`, `clob_token_ids[]`
- `GET /markets/keyset` — cursor pagination (`limit` ≤100, `decimalized`, `rfq_enabled`)
- `GET /markets/{id}` · `GET /markets/slug/{slug}` · `GET /markets/{id}/tags` · `GET /markets/{id}/description`
- `POST /markets/abridged` and `POST /markets/information` — POST-body filter queries
- `GET /public-search?q=` — search events/markets/tags/profiles; params `events_status=active|closed`, `limit_per_type`, `page`
- `GET /tags` · `GET /tags/{id}` · `GET /tags/slug/{slug}` · related-tags variants (`/related-tags`, `/related-tags/tags`)
- `GET /series` · `GET /series/{id}` · `GET /series-summary/{id}` · `GET /series-summary/slug/{slug}`
- `GET /sports` · `GET /sports/market-types` · `GET /teams` · `GET /teams/{id}`
- `GET /events/results` (sport results) · `GET /events/pagination` (legacy) · `GET /events/creators` · comment/tweet counters · `GET /status`

**Sort fields (live-verified, camelCase, NO underscores):** events accept `volume24hr`, `liquidity`, `endDate`, `competitive`, `closedTime`; markets additionally `volume`, `startDate`, `spread`, `lastTradePrice`, `bestBid`, `bestAsk`. The underscore form `volume_24hr` returns HTTP 422 "order fields are not valid" (older docs are wrong).

## Data API

- `GET /positions?user=` — `market[]`, `sizeThreshold` (single value, spec), `redeemable`, `mergeable`, `sortBy=CURRENT|CASH|TIME|CASHPNL|PERCENTPNL`, `sortDirection=ASC|DESC`, `limit` ≤500, `offset`
- `GET /closed-positions?user=` — resolved positions with PnL
- `GET /trades?user=&market=` — `takerOnly`, `filterType=CASH|TOKENS`, `filterAmount`, `side`, `limit` ≤500
- `GET /activity?user=` — on-chain feed; `type[]` = TRADE|SPLIT|MERGE|REDEEM|CONVERSION|REWARD, `start`, `end`, `side`, `market=<condition id>` (spec param name)
- `GET /holders?market=<full condition id>` — top holders per token (requires the full 32-byte id)
- `GET /v1/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=` — rank/proxyWallet/vol/pnl (legacy `window=` also tolerated live; both spellings verified 200)
- `GET /oi` — open interest: `global=true` OR `market=` OR `slug=` OR `event=`
- `GET /live-volume?id=<eventId>` — live in-game volume (**param is `id`, not `event`**)
- `GET /value?user=` — total USD value of positions
- `GET /traded?user=` — distinct markets traded
- `GET /v1/market-positions?market=` — everyone's positions in one market
- `GET /other?id=&user=` — "Other" share for augmented neg-risk events
- `GET /revisions?questionID=` — moderated question revisions
- `GET /v1/approvals?user=` — token approval state of a wallet
- `GET /v1/activity/combos` · `GET /v1/positions/combos` — combo market activity/positions
- `GET /` — health check

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
- `GET /fee-rate[/{token_id}]` · `GET /rewards/markets/current` · `POST /markets/live-activity` + `GET /markets/live-activity/{condition_id}`
- `GET /time` — server time

Authenticated (L2 headers):
- Orders: `GET /data/orders` (`market`, `asset_id`, `id`), `GET /data/order/{orderID}`, `POST /order`, `POST /orders` (≤15)
- Trades: `GET /data/trades` (`market`, `asset_id`, `before`, `after`)
- Cancels: `DELETE /order` body `{orderID}`, `DELETE /orders` body `[ids]`, `DELETE /cancel-all`, `DELETE /cancel-market-orders` body `{market[, asset_id]}`
- Heartbeat: `POST /heartbeats` body `{heartbeat_id}` (also `POST /v1/heartbeats`)
- Balance: `GET /balance-allowance?asset_type=COLLATERAL|CONDITIONAL&token_id=&signature_type=`, refresh via `PUT /balance-allowance` or `GET /balance-allowance/update`
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
| CTF Exchange | `0xE111180000d2663C0091e4f400237545B87B996B` |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` |
| Neg Risk Adapter (CLOB v1) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` (deprecated) |
| Conditional Tokens (CTF) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| pUSD CollateralToken proxy | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFb` |
| CollateralOnramp / Offramp | `0x93070a847efEf7F70739046A929D47a521F5B8ee` / `0x2957922Eb93258b93368531d39fAcCA3B4dC5854` |
| Gnosis Safe Factory / Proxy Factory | `0xaacfeea03eb1561c4e67d661e40682bd20e3541b` / `0xaB45c5A4B0c941a2F231C04C3f49182e1A254052` |
| UMA Adapter | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` |

Older listings (CTF Exchange `0x4bFb41d5…`, NegRisk Exchange `0xC5d563A3…`, USDC.e as collateral) are superseded — treat pre-2026 material citing them as historical.

## Response quirks worth knowing

- Gamma market objects return `clobTokenIds`, `outcomes`, `outcomePrices` as **JSON-encoded strings** in some endpoints — parse defensively.
- `/events` embeds full markets arrays unless you use keyset mode or prune.
- Batch endpoints (`/books`, `/prices`, `/midpoints`, `/spreads`, `/last-trades-prices`) take FLAT arrays of `{token_id[, side]}` objects; the older `{params:[…]}` wrapper returns empty results.
- Rate-limit budget headers on trading routes: `Poly-RateLimit-Remaining|Reset|Tier`.
