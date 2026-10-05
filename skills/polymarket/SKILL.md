---
name: polymarket
description: Deep Polymarket API knowhow — L1/L2 authentication and HMAC signing, unified SDK (@polymarket/client) and Protocol V2 markets (positionIds, ExchangeV3, CONDITIONAL-V2), order types and placement (GTC/GTD/FOK/FAK, batch, heartbeat), market data via Gamma/CLOB/Data API v2 (cursor pagination, snake_case), WebSocket market/user/sports channels plus PolyBolt reference prices, CTF and Router operations (split/merge/redeem), negative risk, bridge, gasless relayer, fees, error codes, rate limits, geoblock rules, plus the Perps and Combos/RFQ APIs. Use when building Polymarket integrations, interpreting results from the polymarket-knowhow MCP tools, or answering questions about prediction-market trading on Polygon.
---

# Polymarket Knowhow

Reference knowledge for the [Polymarket](https://polymarket.com) prediction-market APIs, verified against production. Adapted in part from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT).

## When to use

- Authenticating against Polymarket APIs (L1 key derivation, L2 HMAC signing)
- Placing or managing orders on V1 (CTF) and Protocol V2 markets (limit/market, GTC/GTD/FOK/FAK, batch, cancel) with the unified SDK
- Reading orderbook data (prices, spreads, midpoints, depth)
- Fetching market/event data (Gamma API, Data API **v2** — envelope `{data, pagination}`, cursor-only pagination, snake_case fields, `condition` market filter)
- Choosing outcome ids: V1 `clobTokenIds`/`tokenId` vs V2 `positionIds`/`positionId` (Gamma `version` field)
- WebSocket subscriptions (market channel, user channel, sports, PolyBolt reference prices)
- CTF and V2 Router operations (split, merge, redeem) and negative-risk markets
- Bridge deposits/withdrawals, gasless transactions via the relayer
- Fees, error codes, rate limits, geoblock behavior
- Perpetual futures (`perps`) and combination markets (Combos/RFQ)

If this plugin's **polymarket-knowhow MCP server** is connected you also have live read-only tools available (`polymarket_search`, `polymarket_events_list`, `polymarket_market_get`, `polymarket_orderbook`, `polymarket_price`, `polymarket_quote`, `polymarket_price_history`, `polymarket_positions`, …). Prefer those for live data; use these references for semantics, authentication and anything the tools do not cover.

## Reference index

Detailed modules live next to this file under `references/`. Read the one matching your task before writing integration code:

| Topic | File |
|-------|------|
| All endpoints at a glance | `references/api-endpoints.md` |
| L1/L2 authentication, API keys | `references/authentication.md` |
| Core concepts (markets, events, tokens) | `references/concepts.md` |
| Market data patterns | `references/market-data.md` |
| Order construction and lifecycle | `references/order-patterns.md` |
| WebSocket channels | `references/websocket.md` |
| CTF operations (split/merge/redeem) | `references/ctf-operations.md` |
| Bridge (deposits/withdrawals) | `references/bridge.md` |
| Gasless transactions (relayer) | `references/gasless.md` |
| Fees | `references/fees.md` |
| Error codes | `references/error-codes.md` |
| Rate limits | `references/rate-limits.md` |
| Geoblock rules | `references/geoblock.md` |
| Perpetual futures API | `references/perps.md` |
| Combination markets / RFQ | `references/combos-rfq.md` |

## Ground rules

- Contract addresses moved in 2026 — always take them from official docs or this plugin's tables, never from older guides.
- Batch CLOB endpoints (`/books`, `/prices`, …) take FLAT arrays.
- Gamma sort fields are camelCase (`volume24hr`); underscore forms return HTTP 422.
- Data API v2 (since 2026-10): `/v2/*` routes only, `{data, pagination}` envelope, `cursor` pagination (offset rejected), snake_case fields, `condition` filter (max 20 ids). v1 retires 2026-10-24.
- Protocol V2: use `positionIds` for `version:"v2"` markets; CLOB `asset_type=CONDITIONAL-V2`; V2 contract ops go through the Router.
- When documentation disagrees with production behavior, production wins.

## Installation contexts

This skill ships in two shapes:

1. **DeepSeek Harness plugin** — registered as the `polymarket` runtime skill; module files are served from `knowledge/` via the `polymarket_knowledge` tool.
2. **Claude Code plugin** — this directory; references files are generated copies of knowledge kept in sync by npm scripts; trading/account tools are intentionally not exposed over MCP.
