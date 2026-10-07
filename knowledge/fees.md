> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation (docs.polymarket.com/trading/fees) and live market objects (2026-10-07).

# Fees

Polymarket charges **taker fees** on most market categories to fund the Maker Rebates Program. **Makers are never charged** — only the taker side of a trade pays.

## Taker Fee Formula

```
fee = C × feeRate × p × (1 - p)
```

Where:
- `C` = number of shares traded
- `p` = price of the shares
- `feeRate` = category taker rate (table below)

The fee is **symmetric around 50% probability** — a 30¢ trade costs the same fee as a 70¢ trade — and decreases toward the extremes (near 0% or 100% the fee approaches zero). Fees are computed in USDC and applied at match time by the protocol.

## Live Source: the market's `feeSchedule`

**Never hardcode rates.** Per-market fee parameters live on the Gamma market object (fields live-verified 2026-10-07):

```json
{
  "feesEnabled": true,
  "feeType": "sports_fees_v3",
  "feeSchedule": { "rate": 0.05, "exponent": 1, "takerOnly": true, "rebateRate": 0.15 }
}
```

The general form is `fee = C × p × feeRate × (p × (1 - p))^exponent`; every schedule currently deployed uses `exponent: 1`, which reduces to the formula above. `takerOnly: true` means makers are exempt. Read `feeSchedule` from the market (Gamma `/markets/{id}`, the unified SDK's `market.trading.feeSchedule`) to compute an exact fee for any trade.

## Fee Rates by Category (taker, official — verify live per market)

| Category | Taker Fee Rate | Maker Fee | Maker Rebate | Peak fee (100 sh @ $0.50) |
|----------|----------------|-----------|--------------|---------------------------|
| **Crypto** | 0.07 | 0 | 20% | **$1.75** |
| **Sports** | 0.05 | 0 | 15% | **$1.25** |
| **Economics** | 0.05 | 0 | 25% | $1.25 |
| **Culture** | 0.05 | 0 | 25% | $1.25 |
| **Weather** | 0.05 | 0 | 25% | $1.25 |
| **Other / General** | 0.05 | 0 | 25% | $1.25 |
| **Finance** | 0.04 | 0 | 25% | $1.00 |
| **Politics** | 0.04 | 0 | 25% | $1.00 |
| **Mentions** | 0.04 | 0 | 25% | $1.00 |
| **Tech** | 0.04 | 0 | 25% | $1.00 |
| **Geopolitics** | 0 — fee-free | 0 | — | $0 |

## Worked Example (official)

Sports market, buy **100 shares at $0.50**:

```
fee = 100 × 0.05 × 0.50 × (1 − 0.50) = 100 × 0.05 × 0.25 = $1.25
```

Crypto at the same price: `100 × 0.07 × 0.25 = $1.75`. A 0.04-rate category: `$1.00`.

## Fee Tables (100 shares, taker)

**Crypto (rate 0.07):** $0.01→$0.07 · $0.05→$0.33 · $0.10→$0.63 · $0.20→$1.12 · $0.30→$1.47 · $0.40→$1.68 · $0.50→**$1.75** · then symmetric down to $0.99→$0.07.

**Sports / Economics / Culture / Weather / Other (rate 0.05):** $0.01→$0.05 · $0.05→$0.24 · $0.10→$0.45 · $0.20→$0.80 · $0.30→$1.05 · $0.40→$1.20 · $0.50→**$1.25** · symmetric down to $0.99→$0.05.

**Finance / Politics / Mentions / Tech (rate 0.04):** $0.01→$0.04 · $0.05→$0.19 · $0.10→$0.36 · $0.20→$0.64 · $0.30→$0.84 · $0.40→$0.96 · $0.50→**$1.00** · symmetric down to $0.99→$0.04.

## Precision

Fees are computed in USDC and **rounded to 5 decimal places**, with a minimum charge of **0.00001 USDC**; smaller amounts round to zero (very small trades near the price extremes may carry no fee).

## Fee-Free Markets

- **Geopolitics / world-events markets** — Polymarket charges no fees on these.
- **USDC deposits and withdrawals** — free (intermediaries like Coinbase/MoonPay may charge their own).
- Makers on every market — the maker fee rate is 0 across the board.

## Fee Handling

### Using the SDK (automatic)

The unified SDKs handle fees end to end: fees resolve from the market's fee schedule and the protocol applies them at match time — **no fee info is included in orders** (the CLOB order struct no longer carries `feeRateBps`; it was removed with the 2026-04 exchange upgrade).

```bash
npm install @polymarket/client@latest        # TypeScript
pip install --upgrade polymarket-client      # Python
cargo add polymarket_client_sdk_v2@0.7.0 --features clob   # Rust (CLOB only)
```

V2 fee semantics (ExchangeV3): a BUY's fee adds to its collateral spend; a SELL's fee is deducted from proceeds. FOK/FAK BUY market orders target total spend — include fees in `maxSpend`/`amount` or the SDK pays them on top.

### REST (reading fees, not signing them)

- **Taker-fee parameters**: read the Gamma market object — `feesEnabled`, `feeType`, `feeSchedule = {rate, exponent, takerOnly, rebateRate}` — and apply the formula above. This is the authoritative live source.
- **CLOB `GET /fee-rate/{token_id}`** returns `{"base_fee": 1000}` — a **legacy cap field**, NOT the taker fee. Do not use it to compute what a trade costs.

## Key Facts

- **Most categories now have taker fees** (0.04–0.07) — only geopolitics is fee-free; the old "politics and economics are free" guidance is obsolete.
- **Makers never pay** — fees are taker-only on every schedule (`takerOnly: true`).
- **Fees peak at 50% probability** (0.25 × feeRate per share) and shrink toward the extremes.
- **Fees fund maker rebates** (rebateRate 15–25% by category, redistributed daily); takers can also recover part via the tiered Taker Rebate Program.
