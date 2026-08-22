
> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Fees

Polymarket does not charge fees on most markets. Certain market types have taker fees enabled to fund the Maker Rebates Program.

## Fee-Free Markets

The vast majority of Polymarket markets have **no trading fees**:
- No fees to deposit or withdraw USDC (intermediaries like Coinbase/MoonPay may charge their own)
- No fees to trade shares

## Markets With Fees

The following market types charge a small taker fee on each trade. Fees are collected and redistributed daily to market makers as rebates.

| Market Type | Fee Rate | Exponent | Maker Rebate % | Max Effective Rate |
|-------------|----------|----------|----------------|--------------------|
| **Crypto** (BTC/ETH/SOL/XRP 15-min) | 0.25 | 2 | 20% | **1.56%** at 50% price |
| **Sports** (NCAAB, Serie A) | 0.0175 | 1 | 25% | **0.44%** at 50% price |

Fees apply only to markets deployed on or after the activation date. Pre-existing markets are unaffected.

## Fee Formula

```
fee = C × p × feeRate × (p × (1 - p))^exponent
```

Where:
- `C` = number of shares traded
- `p` = price of the shares
- `feeRate` = market-type-specific rate
- `exponent` = market-type-specific exponent

The effective rate **peaks at 50% probability** and decreases symmetrically toward the extremes (near 0% or 100%).

## Fee Tables

### Crypto Markets

| Price | Trade Value | Fee (USDC) | Effective Rate |
|-------|-------------|------------|----------------|
| $0.01 | $1 | $0.00 | 0.00% |
| $0.05 | $5 | $0.003 | 0.06% |
| $0.10 | $10 | $0.02 | 0.20% |
| $0.20 | $20 | $0.13 | 0.64% |
| $0.30 | $30 | $0.33 | 1.10% |
| $0.40 | $40 | $0.58 | 1.44% |
| $0.50 | $50 | $0.78 | **1.56%** |
| $0.60 | $60 | $0.86 | 1.44% |
| $0.70 | $70 | $0.77 | 1.10% |
| $0.80 | $80 | $0.51 | 0.64% |
| $0.90 | $90 | $0.18 | 0.20% |
| $0.99 | $99 | $0.00 | 0.00% |

### Sports Markets (NCAAB, Serie A)

| Price | Trade Value | Fee (USDC) | Effective Rate |
|-------|-------------|------------|----------------|
| $0.10 | $10 | $0.02 | 0.16% |
| $0.20 | $20 | $0.06 | 0.28% |
| $0.30 | $30 | $0.11 | 0.37% |
| $0.40 | $40 | $0.17 | 0.42% |
| $0.50 | $50 | $0.22 | **0.44%** |
| $0.60 | $60 | $0.25 | 0.42% |
| $0.70 | $70 | $0.26 | 0.37% |
| $0.80 | $80 | $0.22 | 0.28% |
| $0.90 | $90 | $0.14 | 0.16% |

## Fee Precision

Fees are rounded to 4 decimal places. The smallest fee charged is **0.0001 USDC**. Anything smaller rounds to zero.

## Identifying Fee-Enabled Markets

Markets with fees have `feesEnabled` set to `true` on the market object.

```bash
# Check fee rate for a specific token
GET https://clob.polymarket.com/fee-rate?token_id={token_id}
```

Fee-enabled markets return a non-zero value; fee-free markets return `0`.

## Fee Handling

### Using the SDK (automatic)

The official CLOB clients **automatically handle fees** — they fetch the fee rate and include it in the signed order payload. No extra code needed.

```bash
# Ensure latest SDK version
npm install @polymarket/clob-client@latest    # TypeScript
pip install --upgrade py-clob-client          # Python
cargo add polymarket-client-sdk               # Rust
```

### Using the REST API (manual)

If calling the REST API directly, you must manually include the fee rate in your signed order payload.

**Step 1:** Fetch the fee rate:

```bash
GET https://clob.polymarket.com/fee-rate?token_id={token_id}
```

**Step 2:** Add `feeRateBps` to your order object before signing:

```json
{
  "salt": "12345",
  "maker": "0x...",
  "signer": "0x...",
  "taker": "0x...",
  "tokenId": "71321045...",
  "makerAmount": "50000000",
  "takerAmount": "100000000",
  "expiration": "0",
  "nonce": "0",
  "feeRateBps": "1000",
  "side": "0",
  "signatureType": 2,
  "signature": "0x..."
}
```

**Step 3:** Sign the complete order (including `feeRateBps`) and POST to the order endpoint.

**Important:** Always fetch `fee_rate_bps` dynamically — do not hardcode. The fee rate varies by market type and may change over time.

## Key Takeaways

- **Most markets are free** — political, economic, social event markets have zero fees
- **Crypto and select sports markets have fees** — max 1.56% (crypto) or 0.44% (sports) at 50% probability
- **Fees decrease near extremes** — buying at $0.95 or $0.05 incurs near-zero fees
- **SDK handles it automatically** — just keep your SDK updated
- **Fees fund maker rebates** — they incentivize liquidity providers to offer tighter spreads
