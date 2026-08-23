# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows semver.

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
