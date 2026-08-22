# Contributing

Thanks for improving dsh-polymarket-knowhow! Read [CLAUDE.md](CLAUDE.md) first — it documents the architecture, invariants and testing policy agents rely on.

## Ground rules

1. **Production is the source of truth.** When official docs, the bundled knowledge modules and live API behavior disagree, verify against the live API and fix code + docs together.
2. **Every endpoint change ships with evidence**: an OpenAPI pointer (`.notes/specs/`) or a passing live test.
3. **Read-only by default.** Anything that mutates account state belongs behind `trading.enabled` / `perps.enabled` and must fail closed when credentials are incomplete.
4. **No new runtime dependencies.** The core clients use Node built-ins only. The sole sanctioned external integration is the optional `@polymarket/clob-client` lazy import for order signing.

## Workflow

```sh
git clone <your fork>
cd dsh-polymarket-knowhow
node scripts/setup-dev.mjs   # link dev deps from a harness checkout
npm test                     # unit suite
npm run test:live            # read-only production smoke tests
```

- Keep `npm run typecheck` clean; strict mode, NodeNext.
- Add tests for behavior changes: golden vectors for signing changes, stubbed-fetch tests for tool plumbing, live tests only for new read paths.
- Update `knowledge/*.md` whenever endpoint facts change, and `CHANGELOG.md` under a new semver bump.
- PRs should state what was verified and how.

## Reporting drift

Polymarket evolves fast. If you find an endpoint that changed:

1. Capture the failing response (status + body).
2. Check `.notes/specs/` or re-fetch the OpenAPI spec.
3. Open an issue titled `[drift] <endpoint>` with both.
