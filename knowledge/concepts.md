
> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Core Concepts

## Markets & Events

A **market** is the fundamental tradable unit — a single binary Yes/No question.

Every market has:

| Identifier | Description |
|------------|-------------|
| Condition ID | Unique identifier for the market's condition in CTF contracts |
| Question ID | Hash of the market question used for resolution |
| Token IDs | ERC1155 token IDs for trading — one for Yes, one for No |

An **event** groups one or more related markets:

```
Single-market event:
  Event: "Will BTC reach $150k by Dec 2026?"
  └── Market: Yes/No

Multi-market event (negative risk):
  Event: "Who will win the 2028 Presidential Election?"
  ├── Market: Candidate A? (Yes/No)
  ├── Market: Candidate B? (Yes/No)
  └── Market: Other? (Yes/No)
```

Markets can only be traded via CLOB if `enableOrderBook` is `true`.

### Identifying Markets

Every market/event has a unique **slug** in the URL:

```
https://polymarket.com/event/fed-decision-in-october
                              └── slug: fed-decision-in-october
```

```bash
# Fetch by slug
curl "https://gamma-api.polymarket.com/events?slug=fed-decision-in-october"
```

### Sports Markets

Outstanding limit orders are **auto-cancelled** when a game begins. However, if a game starts earlier than scheduled, orders may not be cleared in time.

## Positions & Tokens

Trading creates **ERC1155 conditional tokens** backed by USDC.e collateral:
- Every Yes/No pair is backed by exactly **$1 of USDC.e**
- Yes at $0.60 + No at $0.40 = $1.00 (always)
- Winning tokens redeem for $1.00, losing tokens become $0.00

## Prices & Orderbook

Prices aren't set by Polymarket — they emerge from supply and demand on the **Central Limit Order Book (CLOB)**:
- Prices range from $0.01 to $0.99
- The price represents the market's implied probability
- $0.60 Yes ≈ 60% implied probability of that outcome

## Order Lifecycle

```
1. Create & Sign  → EIP712-signed limit order (offchain)
2. Submit to CLOB → Operator validates signature, balance, allowance, tick size
3. Match or Rest  → Marketable orders match immediately; others rest on book
4. Settlement     → Operator submits matched trade to blockchain (atomic)
5. Confirmation   → Trade achieves finality on Polygon
```

### Order Statuses

| Status | Description |
|--------|-------------|
| `live` | Resting on the book |
| `matched` | Matched immediately |
| `delayed` | Marketable order subject to 3-second delay (sports markets) |
| `unmatched` | Placed on book after delay expired without match |

### Trade Statuses

| Status | Terminal | Description |
|--------|----------|-------------|
| `MATCHED` | No | Sent to executor for onchain submission |
| `MINED` | No | Transaction mined into blockchain |
| `CONFIRMED` | Yes | Finality achieved, successful |
| `RETRYING` | No | Transaction failed, being retried |
| `FAILED` | Yes | Failed permanently |

### Maker vs Taker

| Role | Description | When |
|------|-------------|------|
| Maker | Adds liquidity | Your order rests and is later matched |
| Taker | Removes liquidity | Your order matches immediately |

Price improvement benefits the taker: buy at $0.55, matched against sell at $0.52 → you pay $0.52.

### Requirements Before Trading

| Requirement | Description |
|-------------|-------------|
| Balance | Sufficient USDC.e (buys) or tokens (sells) |
| Allowance | Approve Exchange contract to spend your assets |
| API Credentials | Valid API key for authenticated endpoints |

Max order size: `balance - sum(openOrderSize - filledAmount)`

## Resolution

Markets resolve via the **UMA Optimistic Oracle** — decentralized, permissionless:

```
1. Proposal       → Anyone proposes outcome + posts bond (~$750 USDC.e)
2. Challenge (2h) → Anyone can dispute during challenge period
3. If disputed    → New proposal round or UMA DVM token holder vote
4. Settlement     → Winning tokens redeemable for $1.00
```

### Resolution Timeline

| Phase | Duration |
|-------|----------|
| Challenge period | 2 hours |
| Debate (if disputed) | 24-48 hours |
| UMA voting (if disputed) | ~48 hours |
| **Undisputed total** | **~2 hours** |
| **Disputed total** | **4-6 days** |

### Resolution Rules

Always read resolution rules before trading:
- **Resolution source** — Where outcome is determined (official announcements, etc.)
- **End date** — When market is eligible for resolution
- **Edge cases** — How ambiguous situations are handled

### Clarifications

In rare cases, Polymarket may issue "Additional context" updates:
- Cannot change the fundamental intent of the question
- Published onchain via bulletin board contract
- Request clarifications in Polymarket Discord `#market-review`

## Negative Risk Markets

Capital-efficient multi-outcome events where only one outcome can win:

```
"Other" 1 No → converts to → "Trump" 1 Yes + "Harris" 1 Yes
```

A No share in any market converts into 1 Yes share in every other market.

```typescript
// Must specify negRisk in order options
const response = await client.createAndPostOrder(
  { tokenID: "TOKEN_ID", price: 0.5, size: 100, side: Side.BUY },
  { tickSize: "0.01", negRisk: true },  // Required
);
```

### Augmented Negative Risk

Standard neg risk requires all outcomes known at creation. **Augmented neg risk** allows adding new outcomes (e.g., new candidate enters race) after trading begins.

### Neg Risk Contracts

| Contract | Address |
|----------|---------|
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |
