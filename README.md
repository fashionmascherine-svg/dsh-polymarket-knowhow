# dsh-polymarket-knowhow

**A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that gives your agent complete, verified Polymarket superpowers**: live market-data tools across every Polymarket API (Gamma, CLOB, Data API, Perps, Combos/RFQ, Bridge), opt-in authenticated trading tools, a WebSocket market-stream service, and a bundled *knowhow* skill distilled from the official docs — so the model never hallucinates endpoints, parameters or auth flows.

Built on the knowledge base of [`atompilot/polymarket-skill`](https://github.com/atompilot/polymarket-skill) (MIT) and re-verified against the current official OpenAPI specs **and live API responses**.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)

## Why this plugin

| | This plugin | Raw docs / MCP servers |
|---|---|---|
| Works offline for knowhow (bundled skill + `polymarket_knowledge` tool) | ✅ | ❌ |
| Live tools with typed schemas and bounded output | ✅ | partial |
| Covers auth flow end-to-end (L1 EIP-712 → L2 HMAC → builder headers) | ✅ | partial |
| New 2026 surfaces: **Perps** (56 ops) and **Combos/RFQ** | ✅ documented + read tools | scattered |
| Endpoint drift corrected (`volume24hr` sorts, flat batch payloads, geoblock host, contract moves) | ✅ live-verified | ❌ |

## Capabilities

Four independent Cordis rows (disable any of them by id in a later patch layer):

| Row id | Provides |
|---|---|
| `polymarket-service` | `ctx.polymarket` service: one configured client per Polymarket API (Gamma, CLOB, Data, Perps, RFQ, Bridge, Relayer) with timeout/retry/geoblock-aware HTTP |
| `polymarket-tools` | ~22 always-on market-data tools + opt-in account/trading tools + Perps tools + `polymarket_knowledge` |
| `polymarket-skills` | Embedded runtime skill `polymarket` (16 knowledge modules as resources) via `ctx.skills` |
| `polymarket-stream` | Optional market-channel WebSocket bridge emitting `polymarket/market-event` Cordis events |

### Model tools (always registered)

- Discovery: `polymarket_search`, `polymarket_events_list` (offset + keyset pagination), `polymarket_event_get`, `polymarket_markets_list`, `polymarket_market_get`, `polymarket_tags_list`
- CLOB data: `polymarket_orderbook` (single/batch), `polymarket_price` (single/batch), `polymarket_quote` (mid+spread+last in one call), `polymarket_price_history`, `polymarket_token_info` (tick size, neg-risk, token→market resolution)
- Data API: `polymarket_positions`, `polymarket_trades_public`, `polymarket_activity`, `polymarket_holders`, `polymarket_leaderboard`, `polymarket_open_interest`, `polymarket_live_volume`, `polymarket_portfolio_value`
- Meta: `polymarket_geoblock_check`, `polymarket_combo_markets`, `polymarket_knowledge`

### Opt-in tools (registered only when configured)

- `trading.enabled` + L2 credentials → `polymarket_account_orders`, `polymarket_account_trades`, `polymarket_cancel_orders`, `polymarket_balance_allowance`, `polymarket_heartbeat`, `polymarket_api_keys`, `polymarket_place_order`*
- `perps.enabled` + perps credentials → `polymarket_perps_market_data`, `polymarket_perps_account`

\* Order placement signs through the official [`@polymarket/clob-client`](https://www.npmjs.com/package/@polymarket/clob-client) SDK when it is resolvable (see [Trading setup](#trading-setup)). Everything else uses zero-dependency Node crypto.

## Install

```sh
# From GitHub (pin a commit for reproducibility)
dsh plugin --profile my-profile add github:fashionmascherine-svg/dsh-polymarket-knowhow#<sha>

# From a local checkout
dsh plugin --profile my-profile add ./dsh-polymarket-knowhow

# From a tarball
pnpm pack && dsh plugin --profile my-profile add ./dsh-polymarket-knowhow-0.2.0.tgz
```

The package ships a self-contained `prepare` build. A git install fetches sources, so pnpm ≥10 asks you to allow the build once — copy the package key pnpm prints into your profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-polymarket-knowhow: true
```

Then boot: `dsh --profile my-profile`. All four rows activate; only safe read-only tools are visible unless you enable trading/perps.

## Use in Claude Code

The same repository is also a [Claude Code](https://claude.com/claude-code) plugin. It bundles:

- the **`polymarket` skill** — the 15 knowledge modules under `skills/polymarket/references/` (generated from `knowledge/`, single source of truth);
- a **read-only MCP server** (`scripts/mcp-server.mjs`) exposing the live market-data tools (search, events, orderbook, prices, quote, price history, positions, trades, leaderboard, open interest, perps market data, …). Trading/account tools are never exposed — the server is built with credentials resolution disabled and a denylist guard on top.

Install from this repo's bundled marketplace:

```
/plugin marketplace add fashionmascherine-svg/dsh-polymarket-knowhow
/plugin install polymarket-knowhow@fashionmascherine-svg-polymarket
```

Or attach just the MCP server to any MCP client:

```sh
claude mcp add polymarket-knowhow -- node /path/to/dsh-polymarket-knowhow/scripts/mcp-server.mjs
```

The prebuilt `lib/` is committed, so both paths work out of the box; after touching `src/` run `npm run build` and commit the rebuilt `lib/`. After editing `knowledge/*.md` regenerate the skill copies with `npm run sync:claude-skill`.

## Configuration

Defaults are sensible (public endpoints, no credentials, trading off). Override any field from your profile's `cordis.patch.yml`:

```yaml
- id: polymarket-service
  config:
    timeoutMs: 20000
    maxRetries: 3
    trading:
      enabled: true
      # Explicit creds… (or leave empty to read POLY_API_KEY / POLY_SECRET /
      # POLY_PASSPHRASE / POLY_ADDRESS from the environment)
      apiKey: ''
      secret: ''
      passphrase: ''
      address: ''        # funder/proxy wallet address
      signatureType: 2   # 0 EOA · 1 POLY_PROXY · 2 GNOSIS_SAFE
    perps:
      enabled: false     # reads POLYMARKET_PROXY / POLYMARKET_SECRET env
    stream:
      enabled: false
      assetIds: []       # CLOB token ids to subscribe at startup
    skills: true         # register the embedded knowhow skill

- id: polymarket-stream
  disabled: false         # rows can be toggled individually
```

### Trading setup

1. Create L2 API credentials once (any method):
   - `py-clob-client`: `ClobClient(host, key=pk, chain_id=137).create_or_derive_api_creds()`, or
   - install `@polymarket/clob-client` into the profile and use its `createOrDeriveApiKey()`.
2. Put the four values in config or `POLY_*` environment variables.
3. For order placement, also make the SDK resolvable and set `POLY_PRIVATE_KEY`:

```sh
dsh plugin --profile my-profile add @polymarket/clob-client
```

Read-only account tools (orders, trades, cancels, balances, heartbeat) work without the SDK — they sign requests with Node's built-in HMAC (L2 headers `POLY_ADDRESS/SIGNATURE/TIMESTAMP/API_KEY/PASSPHRASE`).

> ⚠️ Trading is real money. Heartbeats cancel all open orders after a >10s lapse; FOK/FAK BUY `amount` is dollars, SELL is shares. Read `knowledge/order-patterns.md` first.

## Using the service from other plugins

```ts
export const inject = ['polymarket']

export function apply(ctx) {
  const { gamma, clob, dataApi } = ctx.polymarket
  const events = await ctx.polymarket.gamma.listEvents({ active: true, limit: 10 })
  const book = await clob.getBook(tokenId)
  ctx.on('polymarket/market-event', (event) => { /* stream.enabled */ })
}
```

## Knowledge modules (bundled)

`SKILL.md` (entry) · `api-endpoints` (full verified inventory) · `authentication` · `order-patterns` · `market-data` · `websocket` · `concepts` · `ctf-operations` · `fees` · `bridge` · `gasless` · `error-codes` · `rate-limits` · `geoblock` · `perps` · `combos-rfq`

Load via the `skill` tool (name: `polymarket`) or directly with `polymarket_knowledge` (topic or free-text search).

## Verification methodology

- Every REST surface was cross-checked against the official OpenAPI specs fetched from docs.polymarket.com.
- Endpoints were then exercised **live** (read paths) — which caught real drift: camelCase sort fields (`volume_24hr` → 422), flat batch payloads (`params` wrapper returns `[]`), `/live-volume?id=` (not `?event=`), geoblock living on `polymarket.com/api/geoblock`, and moved exchange contract addresses.
- `tests/unit` (28 tests): hardcoded HMAC golden vectors, retry/Retry-After/error mapping over a local server, tool execution over stubbed fetch incl. cancel happy paths and failure propagation.
- `tests/live` (11 tests): production smoke tests against Gamma/CLOB/Data-API/Perps.

```sh
npm test        # unit suite (builds first)
npm run test:live  # hits the real APIs, read-only
```

## Repository layout

```
├── cordis.patch.yml      # bundle patch: 4 plugin rows
├── src/
│   ├── http.ts           # fetch + retry + geoblock error mapping
│   ├── config.ts         # Schemastery schema + credential resolution
│   ├── gamma.ts          # Gamma client   ├── data.ts   # Data API client
│   ├── clob.ts           # CLOB client + L2 HMAC signing
│   ├── perps.ts          # Perps client   ├── extras.ts # Bridge/RFQ/Relayer/geoblock
│   ├── signing.ts        # optional official-SDK order signing
│   ├── service.ts        # PolymarketService (ctx.polymarket)
│   ├── tools.ts          # all model tools
│   ├── skills.ts         # runtime skill registration
│   └── stream.ts         # WebSocket bridge
├── knowledge/            # 16 markdown modules (the "knowhow")
└── tests/{unit,live}/
```

See [CLAUDE.md](CLAUDE.md) for agent-oriented development guidance.

## Credits & license

MIT — see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Knowledge modules adapted from [`atompilot/polymarket-skill`](https://github.com/atompilot/polymarket-skill) (MIT © atompilot), extended and corrected against current official documentation.
