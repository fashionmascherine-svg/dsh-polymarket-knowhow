# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows semver.

## [0.3.1] — fee documentation corrected (taker fee formula + live feeSchedule)

### Fixed
- **The fee knowledge module was stale and understated taker fees** (~⅓ of the real value on sports): the old module documented a 0.0175 sports rate with an `^exponent` term, a 25% maker rebate, "only crypto and sports have fees", 4-decimal rounding and a manual `feeRateBps`-in-the-order REST flow. The official fee model (docs.polymarket.com/trading/fees, cross-checked live on Gamma market objects 2026-10-07) is:
  - `fee = C × feeRate × p × (1 − p)` (USDC, takers only — makers are never charged; schedules carry `takerOnly: true`);
  - rates by category: crypto 0.07, sports 0.05, economics/culture/weather/other 0.05, finance/politics/mentions/tech 0.04, geopolitics 0 — e.g. sports, 100 shares at $0.50 → **$1.25** (the old module computed ~$0.22);
  - live parameters live on the Gamma market object: `feesEnabled` / `feeType` (e.g. `sports_fees_v3`) / `feeSchedule = {rate, exponent, takerOnly, rebateRate}` — read them, never hardcode;
  - rounding is 5 decimals with a 0.00001 USDC minimum; and fees are applied at match time — orders no longer carry `feeRateBps` (removed with the 2026-04 exchange upgrade), so the manual signing flow was removed from the docs.
- `CLOB GET /fee-rate/{token}` documented for what it actually returns (`{"base_fee": 1000}`, a legacy cap field — live-verified), instead of implying it yields the taker fee.

### Added
- `polymarket_token_info` (DSH + MCP) now surfaces the live taker-fee parameters: `fees` (`feesEnabled`/`feeType`/`feeSchedule` resolved from Gamma via the token's condition id) plus `fee_rate_legacy` (the CLOB cap field, clearly labelled) — the tool promised "fee rate" but never returned any fee data before.
- Unit test pinning the token_info fee surface; knowledge module rewritten against the official fee tables (peak fees per 100 shares: crypto $1.75, sports $1.25, 0.04-categories $1.00).

## [0.3.0] — Polymarket Protocol V2 & Data API v2

### Breaking
- **Data API v2 migration** (v1 retires on 2026-10-24): every `DataApiClient` read now hits the `/v2/*` routes. Responses use the v2 envelope `{ data, pagination }` (`data: null` on misses); pagination is cursor-only (`cursor` in, `pagination.next_cursor` out — `offset` is rejected by the API); fields are snake_case (`proxy_wallet`, `token_id` — the v1 `asset` field is renamed); market filtering uses `condition` (≤20 comma-joined ids; v1 `market` param rejected). `holders` requires `condition`; `traded` → `userStats` (`/v2/user-stats`); `closedPositions` → `status=CLOSED`; `marketPositions` → `condition` without `user`; position `sort_by` values are now `current_value|total_pnl|realized_pnl|unrealized_pnl` (v1 values rejected). `/other` and `/revisions` have no v2 counterpart and were removed from the client. All shapes live-verified against production.
- **Trading path migrated to the unified SDK**: `src/signing.ts` now loads `@polymarket/client` (≥0.12.0) + `viem` instead of the retired `@polymarket/clob-client` + ethers v5. The unified SDK routes V1 CTF token ids *and* Protocol V2 position ids through the same `assetId`, resolves tick size/neg-risk/fee schedule automatically (the `marketMeta` argument is gone), settles V2 orders through ExchangeV3 (EIP-712 domain version "3"), and resumes from stored L2 credentials via `credentials` (mapped to the SDK's `key`-shaped boundary). The SDK declares `engines: node >=24`; the repo's own range (`^22.19.0 || >=24.0.0`, package.json) admits it — run the trading path on Node ≥24 to satisfy both contracts. To enable trading: `dsh plugin --profile <name> add @polymarket/client viem`.
- `polymarket_positions` tool: `market` param → `condition`, `offset` → `cursor`, new `status` lifecycle filter (`OPEN|REDEEMABLE|REDEEMABLE_LOST|MERGEABLE|CLOSED`); `polymarket_trades_public`/`polymarket_activity`: `offset` → `cursor` (+`condition` filter on activity); `polymarket_holders`/`polymarket_open_interest`: `market` → `condition`. `polymarket_activity` takes exactly ONE `type` per request (production rejects multi-type queries — see Fixed). Same tool names otherwise.

### Added
- New read-only tools on Data API v2: `polymarket_user_stats` (distinct markets traded + all-time PnL breakdown, replaces `/traded`), `polymarket_resolutions` (resolution status + payout vectors), `polymarket_approvals` (wallet token-approval state). Read-only surface is now 25 DSH tools; the bundled MCP server exposes 26 read-only tools (these 25 plus `polymarket_perps_market_data`). Trading set unchanged.
- `ClobClient.getBalanceAllowance` accepts `asset_type=CONDITIONAL-V2` (Protocol V2 positions) alongside `COLLATERAL`/`CONDITIONAL`; the `polymarket_balance_allowance` tool exposes it.
- `polymarket_leaderboard` gained cursor pagination on both surfaces.
- Knowledge modules document Protocol V2 end to end: V1↔V2 identifier mapping (`version`/`positionIds`/`resolutionStatus` on Gamma), ExchangeV3 + PositionManager + Router + AutoRedeemer + NegRiskModule contract addresses, V2 Router split/merge/redeem semantics (bytes31 conditionId, 6-decimal base units, outcomeIndex 0/1), V2 approval matrix and fill math, unified-SDK client setup, and the **PolyBolt** reference-price WebSocket (`wss://ws-live-v2.polymarket.com/ws`, auth + `price.crypto|price.crypto.twap|price.equity` channels) replacing RTDS. Data API v2 endpoint inventory rewritten (incl. `user-pnl` with its `1d|18h|12h|3h|1h` fidelity enum, `user-volume`, `biggest-winners`, `prices-history`, `resolutions` with the production-observed `posed` status, `status`, the surviving `/v1/accounting/snapshot`, and the retired `/other` + `/revisions`). Perps module gained the 2026-09 changelog deltas (`exchange-stats`, fills `settlement`/`builder_fee`/`total_fee`, terminal statuses).

### Fixed
- `polymarket_activity` multi-type inputs: production `/v2/activity` accepts exactly one `type` per request (repeated keys → HTTP 400 "duplicate field `type`"; bracket/CSV alternate forms return 200 with the filter silently ignored — live-verified). The client now rejects >1 type with an actionable error and both tool surfaces take a single type.
- Stored-credential resume: `@polymarket/client` validates `credentials.key`, so the repo's `{apiKey,…}` shape was rejected at client construction; `toSdkCredentials` now maps to the SDK boundary shape (regression-guarded by a unit test).
- FOK/FAK argument mapping in `placeOrder`: SELL market orders take shares from `size` (documented unit) with `price` forwarded as the worst-price `minPrice`; previously `amount` (dollars) could silently become shares.
- Windows portability of the test harness (ESM dynamic-import URLs, stdio spawn cwd, CRLF-tolerant SKILL.md frontmatter check); `ClobClient.getTrades` no longer declares a `limit` it never sent.

### Changed
- Live smoke tests assert the v2 envelopes against production (including a single-type activity probe); unit suite extended to 60 tests and now covers the v2 routes, cursor plumbing, the activity contract, the credential mapping and the FOK/FAK order mapping (SDK stubbed at the module loader).

## [0.2.1] — standalone MCP server

### Fixed
- The bundled MCP server crashed at startup under Claude Code (`ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-tools`): it imported the DSH tool layer, whose `@deepseek-ai/*` imports resolve only inside a DeepSeek Harness host. The server now imports the pure-Node client modules directly and re-declares the read-only tool layer inline (mirroring src/tools.ts) — truly zero-dependency, verified by full handshake + live `tools/call` outside any harness.
- `startStdio` no longer exits on stdin close while responses are still in flight.

## [0.2.0] — Claude Code plugin

### Added
- The repository now doubles as a **Claude Code plugin**: `.claude-plugin/plugin.json` + bundled single-plugin `marketplace.json` (`/plugin marketplace add fashionmascherine-svg/dsh-polymarket-knowhow`).
- `skills/polymarket/` — Claude Code skill exposing the knowledge modules as generated references (`scripts/sync-claude-skill.mjs`, `npm run sync:claude-skill`); a unit test keeps them in sync with `knowledge/`.
- `scripts/mcp-server.mjs` — zero-dependency MCP stdio server exposing the read-only Polymarket tools to Claude Code and any MCP client. Built with trading/perps disabled and a denylist guard; account/order endpoints are unreachable by construction. Wired through the bundled `.mcp.json` (`${CLAUDE_PLUGIN_ROOT}`).
- Prebuilt `lib/` is now committed so plugin installs work without a build step.
- 19 new unit tests (MCP JSON-RPC dispatch, schema conversion, read-only exposure guarantee, stdio child-process smoke, packaging contract). Suite is now 49 unit + 11 live tests.

### Changed
- `repository.url` points at the real GitHub repository; `@deepseek-ai/dsh-*` peer ranges follow the prerelease-branch guidance (`>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <1`) so harness rc builds no longer hit `ERESOLVE`.

## [0.1.1] — hardening & optimization

### Changed
- HTTP retry backoff now uses ±25% jitter (no lockstep retries across agents) and honours HTTP-date `Retry-After` values in addition to numeric seconds.
- Stream reconnect uses capped exponential backoff with jitter instead of a fixed delay; resets on successful open.
- CLOB `tick-size` and `neg-risk` responses are memoized per token for 5 minutes (they are market constants) — fewer redundant calls when inspecting many markets.
- Flaky retry tests reworked around the new jitter floor; suite is now 30 unit + 11 live tests.

## [0.1.0] — initial release

### Added
- `polymarket-service` Cordis row: configured clients for Gamma, CLOB, Data API, Perps, Combos/RFQ, Bridge and Relayer over a shared HTTP layer (timeouts, retries with Retry-After, geoblock error mapping).
- 22 always-on model tools: search, events (offset + keyset), event/market get, tags, orderbook (single/batch), price (single/batch), composite quote, price history, token info, positions, public trades, activity, holders, leaderboard, open interest, live volume, portfolio value, geoblock check, combo markets, knowledge lookup.
- Opt-in trading tools (`trading.enabled` + L2 credentials): account orders/trades, cancels (single/batch/all/market), balance-allowance, heartbeat, API keys, and SDK-gated order placement via the official `@polymarket/clob-client`.
- Opt-in Perps tools (`perps.enabled`): market data + read-only account views for Polymarket perpetual futures.
- Embedded runtime skill `polymarket` with 16 knowledge modules (authentication, order patterns, market data, WebSocket, CTF operations, fees, bridge, gasless, concepts, error codes, rate limits, geoblock + new api-endpoints/perps/combos-rfq inventories).
- Optional `polymarket-stream` WebSocket bridge emitting Cordis events.
- Unit suite (HMAC golden vectors, HTTP retry/error mapping, tool execution over stubbed fetch) and read-only live smoke suite.

### Verified corrections vs upstream snapshot (atompilot/polymarket-skill, 2026-03)
- Gamma/Data-API sort fields are camelCase (`volume24hr`); underscore forms return HTTP 422.
- CLOB batch endpoints accept flat arrays; `{params:[…]}` wrappers return empty results.
- Data-API `/live-volume` takes `id` (event id), not `event`; `/holders` needs full condition ids.
- Geoblock endpoint is `https://polymarket.com/api/geoblock`.
- Contract addresses moved: CTF Exchange / NegRisk Exchange replaced; pUSD listed as collateral.
- New API surfaces documented: Perps (56 ops) and Combos/RFQ; Gamma keyset pagination; CLOB batch-prices-history, builder-key CRUD, ban-status; Data-API approvals/revisions/combo endpoints.
