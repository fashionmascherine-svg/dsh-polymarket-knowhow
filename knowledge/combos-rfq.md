# Combos & RFQ — Combinatorial Markets API

> New module (absent from the original skill snapshot). Combos are multi-outcome combination markets traded through a request-for-quote (RFQ) mechanism rather than the central limit order book.
> Part of the dsh-polymarket-knowhow distribution, which adapts atompilot/polymarket-skill (MIT); this module is original to this distribution.

## Surfaces

- REST base: `https://combos-rfq-api.polymarket.com` (spec: `combos-rfq-openapi.yaml`)
- RFQ WebSocket: documented at `docs.polymarket.com/api-reference/wss/rfq` (AsyncAPI `asyncapi-rfq.json`)
- Gamma exposure: `GET /events/keyset` and `POST /markets/information` can filter combo markets (`rfq_enabled` on `/markets/keyset`)
- Data-API exposure: `GET /v1/activity/combos`, `GET /v1/positions/combos`
- On-chain suite (Polygon): PositionManager `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF`, Binary/NegRisk/Combinatorial modules, Combo Exchange proxy `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa`, AutoRedeemer `0xa1200000d0002264C9a1698e001292D00E1b00af`

## REST endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/rfq/combo-markets?limit&cursor&exclude` | none | List combo markets |
| POST | `/v1/maker/quotes` | CLOB L2 headers | Submit a quote as maker |
| POST | `/v1/maker/quotes/cancel` | CLOB L2 headers | Cancel quotes |
| POST | `/v1/maker/confirmations` | CLOB L2 headers | Last-look confirm/decline |

Maker operations reuse the standard CLOB L2 header set (`POLY_ADDRESS`, `POLY_API_KEY`, `POLY_PASSPHRASE`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`) against this different host.

## How trading works

1. Takers request a combination quote; makers stream RFQ requests over the WebSocket and answer with `POST /v1/maker/quotes`.
2. When a taker accepts, the winning maker gets a last-look confirmation via `POST /v1/maker/confirmations` (confirm executes, decline forfeits).
3. Settlement mints/burns combination positions through the PositionManager modules; combos can mix binary, neg-risk and combinatorial legs.
4. Positions and activity surface through the data-api `combos` endpoints.

## Agent guidance

- Read-only discovery is safe: use the `polymarket_combo_markets` tool (or `ctx.polymarket.rfq.comboMarkets()`).
- Quoting is a market-making activity with inventory risk: read `knowledge/rate-limits.md` for trading budgets and the official `trading/combos/*` pages before enabling maker flows. The plugin does not expose maker endpoints as model tools by default; call them via `ctx.polymarket` service code if you build an automated maker.
