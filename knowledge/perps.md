# Perps — Polymarket Perpetual Futures API

> New module (absent from the original skill snapshot): Polymarket launched perpetual futures. This module documents the HTTP surface; specs live at docs.polymarket.com/api-spec/perps-openapi.json and AsyncAPI at asyncapi-perps.json.

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
- `/tickers` · `/bbo?instrument=` best bid/offer · `/book?instrument=&depth=`
- `/klines?instrument=&interval=<1m|15m|1h|…>` candles · `/mark-history` mark price history
- `/index` index prices · `/trades?instrument=` recent trades
- `/portfolio?address=` public portfolio of any wallet · `/position-fills`
- `/funding?instrument=` funding history · `/fees` fee schedule · `/limit-tiers` · `/statistics`

### Account (`/v1/account/*`, authed)
- `/balances` balances · `/portfolio` positions overview · `/pnl` profit series · `/stats`
- `/fills[?instrument=]` execution fills · `/open-orders` · `/orders` order history
- `/funding` funding payments · `/deposits` / `/withdrawals` records
- `/limits` account limits · `/rewards` rewards · `/notifications` (+ `/notifications/read` POST)
- `/auto-cancel` GET auto-cancel settings · `/config`, `/credentials`, `/equity?interval&start_timestamp`
- `/internal-transfer` POST + `/internal-transfers` list · `/invite` POST create, GET check · `/referral` GET/POST · `/proxy` POST create / DELETE

### Trading (`/v1/trade/*`, authed)
- `POST /orders` create orders · `DELETE /orders` cancel by id · `DELETE /orders-coid` cancel by client order id · `DELETE /orders/all` cancel everything
- `PATCH /auto-cancel` set auto-cancel · `PATCH /leverage` and `/leverage/batch` update leverage · `PATCH /margin` isolated margin updates

### BLP (`/v1/blp/*`)
- `POST /enroll`, `GET /enrollment`, `GET /liquidations`

## Notes for agents

- Perps are a separate product from the prediction-market CLOB: different base URL, different auth headers, different SDK surface. Do not mix CLOB L2 credentials with perps credentials.
- Funding rates, leverage and liquidation semantics are documented in the concept pages — read them before advising on positions or risk.
- The dsh-polymarket-knowhow plugin exposes read-only perps tools (`polymarket_perps_market_data`, `polymarket_perps_account`) when `perps.enabled=true`; trading endpoints are available on the service (`ctx.perps` client) but intentionally not exposed as model tools yet.
