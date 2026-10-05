<!-- GENERATED from knowledge/perps.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/perps.md and run npm run sync:claude-skill. -->

# Perps — Polymarket Perpetual Futures API

> New module (absent from the original skill snapshot): Polymarket launched perpetual futures. This module documents the HTTP surface; specs live at docs.polymarket.com/api-spec/perps-openapi.json and AsyncAPI at asyncapi-perps.json.
> Part of the dsh-polymarket-knowhow distribution, which adapts atompilot/polymarket-skill (MIT); this module is original to this distribution.

## Overview

- Base URL: `https://api.perpetuals.polymarket.com`
- WebSocket: `wss://ws.perpetuals.polymarket.com` (~27 channels: `tickers`, `bbo`, `book`, `klines`, `trades`, `fills`, `orders`, `balances`, `portfolio`, `funding`, `deposits`, `withdrawals`, `notifications`, `statistics`, `auto-cancel`, `update-margin`, `update-leverage(s)`, `index`, auth + ping control messages)
- Docs sections: `docs.polymarket.com/api-reference/perps/*` plus concepts under `/perps/*` (margin, funding, liquidation, market sessions, fees) and a dedicated rate-limits page.
- Geographic restrictions apply (separate page; check before integrating).

## Authentication

Two headers, both required on account/trade groups:

| Header | Meaning |
|---|---|
| `POLYMARKET-PROXY` | Your proxy address |
| `POLYMARKET-SECRET` | The corresponding proxy secret (sent directly) |

The whole `/v1/info/*` group is public — no headers needed.

## Endpoints

### Public (`GET /v1/info/*`)
- `/ping` connection test · `/time` server time · `/exchange` exchange info
- `/assets` collateral assets · `/instruments` tradable instruments
- `/tickers` · `/bbo?instrument_id=` best bid/offer · `/book?instrument_id=&depth=`
- `/klines?instrument_id=&interval=<1s|1m|5m|15m|30m|1h|4h|6h|12h|1d|1w>&start_timestamp=<ms>[&end_timestamp=<ms>]` candles · `/mark-history?instrument_id=&interval=&start_timestamp=<ms>` (same interval enum; timestamps are epoch **milliseconds**)
- `/index` index prices · `/trades?instrument_id=` recent trades
- `/portfolio?address=` public portfolio of any wallet · `/position-fills`
- `/funding?instrument_id=` funding history · `/fees` fee schedule · `/limit-tiers` · `/statistics`

### Account (`/v1/account/*`, authed)
- `/balances` balances · `/portfolio` positions overview · `/pnl` profit series · `/stats`
- `/fills` execution fills (no instrument filter in spec) · `/open-orders[?instrument_id=]` · `/orders[?instrument_id=]` order history
- `/funding` funding payments · `/deposits` / `/withdrawals` records
- `/limits` account limits · `/rewards` rewards · `/notifications` (+ `/notifications/read` POST)
- `/auto-cancel` GET auto-cancel settings · `/config`, `/credentials`, `/equity?interval&start_timestamp`
- `/internal-transfer` POST + `/internal-transfers` list · `/invite` POST create, GET check · `/referral` GET/POST · `/proxy` POST create / DELETE

### Trading (`/v1/trade/*`, authed)
- `POST /orders` create orders · `DELETE /orders` cancel by id · `DELETE /orders-coid` cancel by client order id · `DELETE /orders/all` cancel everything
- `PATCH /auto-cancel` set auto-cancel · `PATCH /leverage` and `/leverage/batch` update leverage · `PATCH /margin` isolated margin updates

### BLP (`/v1/blp/*`)
- `POST /enroll`, `GET /enrollment`, `GET /liquidations`

## Recent API changes (2026, from the official perps changelog)

- **2026-09-27**: fills gain `settlement`, `builder_fee`, `total_fee`; rewards endpoint rejects timestamp params (400); new terminal statuses `instrument_close_only`/`instrument_settled`; instruments gain `close_only` and `settlement` fields; position-snapshots endpoint added.
- **2026-09-14**: 14 history routes now reject `cursor` with 400; leaderboard `account_value` is a cached census value; new 50-level book channel `book::{iid}::50`.
- **2026-09-08**: new `GET /v1/info/exchange-stats` (public aggregate stats, 31-day window, 5-min cache); `instrument_id` filter on fills.
- **2026-08-24**: rejections/acks gain `ts`, `arts`, `ref`; WebSocket envelopes gain `ets`; fills gain optional `liquidation_details`, required `adl` flag (2026-08-10).
- **2026-08-07**: `/v1/info/exchange` adds `engine_version` and documents the `cancel_only` flag.
- **2026-06-10/09**: 20ms taker delay on immediately matching orders; `reduce_only` field on order submission.

## Notes for agents

- Perps are a separate product from the prediction-market CLOB: different base URL, different auth headers, different SDK surface. Do not mix CLOB L2 credentials with perps credentials.
- Funding rates, leverage and liquidation semantics are documented in the concept pages — read them before advising on positions or risk.
- The dsh-polymarket-knowhow plugin exposes read-only perps tools (`polymarket_perps_market_data`, `polymarket_perps_account`) when `perps.enabled=true`; trading endpoints are available on the service (`ctx.perps` client) but intentionally not exposed as model tools yet.
