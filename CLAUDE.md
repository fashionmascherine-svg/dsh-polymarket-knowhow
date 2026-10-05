# CLAUDE.md

Guidance for AI agents (and humans) developing this repository.

## What this repo is

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin bundle (`dsh` key in `package.json`) named **dsh-polymarket-knowhow**. It contributes four Cordis plugin rows via `cordis.patch.yml`: a service, model tools, a runtime skill, and an optional WebSocket stream. Installable into any DSH profile with `dsh plugin add`.

## Commands

```sh
npm test            # build + unit suite (no network)
npm run test:live   # read-only smoke tests against production Polymarket APIs
npm run typecheck   # tsc --noEmit
npm run build       # emit lib/ + lib/types/
```

Node `^22.19 || >=24`. No bundler; `tsc` transpiles `src/*.ts` → `lib/*.js` with declarations in `lib/types/`.

## Local development setup

The dev-time dependencies are symlinked from a DeepSeek Harness source checkout (`../deepseek-harness`):

```
node_modules/@deepseek-ai/cordis      → vendor/cordis
node_modules/@deepseek-ai/schemastery → vendor/schemastery
node_modules/@deepseek-ai/dsh-tools   → packages/core/tools
node_modules/@deepseek-ai/dsh-skill   → packages/skill/skill
node_modules/typescript               → checkout's typescript
node_modules/@types/node              → checkout's @types/node
```

Why symlinks instead of npm installs? The published `@deepseek-ai/*` rc packages declare peerDependencies that are not on npm, so installing them standalone fails. Inside a real DSH installation the loader resolves bare imports against `$DSH_HOME/profiles/node_modules` (a flat fallback of the app's dependency closure), which is why these packages are declared as `peerDependencies` here — never move them to `dependencies`.

If your harness checkout lives elsewhere, re-point the symlinks or use `scripts/setup-dev.mjs` if present.

## Architecture

```
http.ts ── shared fetch layer (timeout, retries w/ Retry-After, JSON errors,
           │        PolymarketHttpError / PolymarketGeoBlockedError)
           ├── gamma.ts    GammaClient   (events/markets/tags/search/sports)
           ├── data.ts     DataApiClient (positions/trades/activity/holders/…)
           ├── clob.ts     ClobClient    (public reads + L2 HMAC auth)
           ├── perps.ts    PerpsClient   (/v1/info/* public + account/trade)
           └── extras.ts   Bridge/RFQ/Relayer clients + geoblock check
service.ts   PolymarketService extends Service → ctx.polymarket (owns all clients,
             resolves credentials from config + POLY_*/POLYMARKET_* env)
tools.ts     registerTools(ctx, service, config) — defineTool() definitions;
             trading tools registered only when trading.enabled AND creds resolve
skills.ts    ctx.skills.register({ name: 'polymarket', content: knowledge/SKILL.md })
stream.ts    market-channel WebSocket bridge → ctx.emit('polymarket/market-event')
signing.ts   OPTIONAL order signing via lazy import of the unified @polymarket/client SDK
knowledge/   16 markdown modules; also shipped resources for the skill
```

### Non-obvious invariants

0. **Entry-module contract (live-boot verified).** Every module named in `cordis.patch.yml` MUST:
   - export `Config` as a **value** re-export (`import { Config } from './config.js'` + `export { Config }`) — a type-only import erases the export and the loader then passes raw/undefined config to apply;
   - NOT have a default export — `unwrapExports` prefers `.default`, so a default-exported class would be instantiated directly, bypassing `apply` and schema validation;
   - declare `inject` with **every** service it touches (`['polymarket', 'tools']` for tools.ts), because the row's `inject` list replaces the module's;
   - export `name`, `inject`, `apply(ctx, config)`. Cordis validates row config against the exported `Config` schema (schemastery fills defaults even for `undefined` input) before calling apply.
1. **Batch CLOB endpoints take FLAT arrays.** `POST /books|/prices|/midpoints|/spreads|/last-trades-prices` bodies are `[{token_id[, side]}]`. The `{params:[…]}` wrapper found in some older SDK code silently returns empty results. Live-verified.
2. **Gamma sort fields are camelCase without underscores** (`volume24hr`, `endDate`, …). Underscore forms return HTTP 422. Live-verified.
3. **L2 signature material** = `timestamp + METHOD + path-with-query [+ JSON body]`, HMAC-SHA256 keyed by the base64-decoded secret, base64 digest. The query string IS part of the signed path. See `buildL2Headers` and its golden-vector tests.
4. **Geoblock** lives on `https://polymarket.com/api/geoblock` (not data-api) and returns `{blocked, ip, country, region}`. API hosts may also answer 403 with a blocked body — mapped to `PolymarketGeoBlockedError`.
5. **Contract addresses moved** (2026): CTF Exchange `0xE111180000d2663C0091e4f400237545B87B996B`, NegRisk Exchange `0xe2222d279d744050d28e00520010520000310F59`, pUSD collateral replaces USDC.e listings; Protocol V2 adds PositionManager/Router/ExchangeV3/AutoRedeemer (see `knowledge/api-endpoints.md`). Older addresses in legacy docs are superseded.
6. **Order placement is SDK-gated by design.** We do not hand-roll EIP-712 order signing; `src/signing.ts` lazily imports the unified `@polymarket/client` SDK (V1 + Protocol V2 support) with a non-literal specifier so absence degrades gracefully at runtime instead of failing install/typecheck.
7. **Tool outputs**: canonical values must be lossless JSON; rendering truncates model-facing text at ~24k chars. Keep heavy nested arrays pruned server-side (see `pruneEvent`/`pruneMarket`).
8. **Every side effect belongs to the plugin fiber** (Cordis effects). Timers/sockets/listeners must be disposed on unload — see `stream.ts` for the pattern.

## Testing policy

- Unit tests stub `globalThis.fetch` BEFORE importing `lib/tools.js` and drive captured `defineTool` definitions directly (`tool.execute(args, exec)`), so schema plumbing is exercised end-to-end without booting Cordis.
- Live tests are read-only and skip when offline. Never add live tests that place orders, cancel anything, or require credentials.
- When you touch an endpoint, re-run `npm run test:live`; when docs disagree with production, production wins — then update both client code and the matching `knowledge/*.md` module.

## Adding coverage

1. Confirm the operation in `.notes/specs/*.yaml|json` (official OpenAPI snapshots) or fetch the spec fresh.
2. Add a typed client method (public vs `l2`).
3. Expose a tool only for safe/read operations unless it belongs behind `trading.enabled`.
4. Update `knowledge/api-endpoints.md` and any topical module.
5. Add/adjust unit tests; extend live tests for new read paths.

## Release checklist

- [ ] `npm run typecheck && npm test && npm run test:live` all green
- [ ] `cordis.patch.yml` rows still match `src/*` entry exports
- [ ] Bump version in `package.json`, note user-visible changes in `CHANGELOG.md`
- [ ] `pnpm pack` produces a tarball whose `prepare`-built `lib/` loads in a fresh profile (`dsh plugin --profile tmp add ./tarball.tgz`)
