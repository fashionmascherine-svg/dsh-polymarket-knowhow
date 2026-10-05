<!-- GENERATED from knowledge/ctf-operations.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/ctf-operations.md and run npm run sync:claude-skill. -->


> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# CTF Operations

The **Conditional Token Framework (CTF)** creates ERC1155 tokens for market outcomes. Three core operations: split, merge, redeem. On **Protocol V2** the same three operations run through the **Router** contract over PositionManager positions (see the V2 section below).

## Token Model

Every binary market has two tokens:

| Token | Redeems for | Condition |
|-------|-------------|-----------|
| **Yes** | $1.00 collateral (pUSD on the current exchange) | Event occurs |
| **No** | $1.00 collateral (as above) | Event does not occur |

Every Yes/No pair is backed by exactly $1.00 of collateral locked in the CTF contract.

## Split

Convert pUSD into a full set of outcome tokens.

```
$100 pUSD → 100 Yes tokens + 100 No tokens
```

### Prerequisites
1. pUSD balance on Polygon
2. pUSD approval for the CTF contract (V1) or Router (V2)
3. Condition ID of the market (the condition must already be prepared on the CTF contract via `prepareCondition`)

### Function: `splitPosition`

| Parameter | Type | Value |
|-----------|------|-------|
| `collateralToken` | IERC20 | pUSD collateral `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFb` |
| `parentCollectionId` | bytes32 | `0x0000...0000` (32 zero bytes) |
| `conditionId` | bytes32 | Market's condition ID |
| `partition` | uint[] | `[1, 2]` for binary (Yes=1, No=2) |
| `amount` | uint256 | Amount of pUSD to split |

## Merge

Convert a full set of outcome tokens back to pUSD. Inverse of split.

```
100 Yes tokens + 100 No tokens → $100 pUSD
```

### Prerequisites
1. Equal amounts of both Yes and No tokens
2. Condition ID (the condition must already be prepared on the CTF contract via `prepareCondition`)
3. Sufficient gas for the transaction

### Function: `mergePositions`

Same parameters as split. Burns one unit of each position per unit of collateral returned.

## Redeem

Exchange winning tokens for pUSD after market resolution.

```
Market resolves YES:
  100 Yes tokens → $100 pUSD
  100 No tokens  → $0
```

### Prerequisites
1. Market must be resolved
2. Hold winning tokens
3. Know the condition ID

### Function: `redeemPositions`

| Parameter | Type | Value |
|-----------|------|-------|
| `collateralToken` | IERC20 | pUSD collateral address |
| `parentCollectionId` | bytes32 | `0x0000...0000` |
| `conditionId` | bytes32 | Market's condition ID |
| `indexSets` | uint[] | `[1, 2]` — redeems both (only winner pays) |

Redemption burns your **entire** token balance for the condition — no amount parameter. No deadline — winning tokens are always redeemable.

### Payout Vectors

| Outcome | Payout Vector | Redemption |
|---------|---------------|------------|
| Yes wins | `[1, 0]` | Yes = $1, No = $0 |
| No wins | `[0, 1]` | Yes = $0, No = $1 |

## Contract Addresses

| Contract | Address | Purpose |
|----------|---------|---------|
| CTF | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | Token storage and operations (V1) |
| pUSD CollateralToken (proxy) | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFb` | Collateral token |
| CTF Exchange | `0xE111180000d2663C0091e4f400237545B87B996B` | Standard market trading (V1/CTF) |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` | Neg risk market trading (V1/CTF) |
| Neg Risk Adapter (CLOB v1) | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` | Neg risk conversions (deprecated) |
| PositionManager (V2) | `0x006F54F7f9A22e0000CC2AB60031000000ae9fEF` | V2 position ledger |
| Router (V2) | `0x12121212006e4CD160D18e3f00711DA5c3372600` | V2 split/merge/redeem |
| ExchangeV3 (V2) | `0xe3333700cA9d93003F00f0F71f8515005F6c00Aa` | V2 trading venue |
| AutoRedeemer (V2) | `0xa1200000d0002264C9a1698e001292D00E1b00af` | Optional automatic redemption |

The pre-2026 addresses (CTF Exchange `0x4bFb41d5…`, NegRisk Exchange `0xC5d563A3…`, USDC.e `0x2791Bca1…`) are superseded — treat older material citing them as historical.

## Protocol V2: Router Operations

V2 positions live in the **PositionManager**; split/merge/redeem go through the **Router**, which pulls from and returns to the caller atomically in one transaction (never pre-transfer assets to a module separately).

```solidity
function split(bytes31 conditionId, uint256 amount)
function merge(bytes31 conditionId, uint256 amount)
function redeem(bytes31 conditionId, uint256 outcomeIndex, uint256 amount)
```

Key parameter rules:

- **conditionId** is `bytes31`; a padded `bytes32` may be narrowed only after validating the final byte is zero.
- **amount** is in 6-decimal base units — `1_000_000` = one pUSD = one share; merge spends this amount of *each* outcome.
- **outcomeIndex** is `0` = YES, `1` = NO (replacing CTF index sets `1`/`2`); redeem takes an explicit amount (unlike CTF redemption, which burns the whole balance).

### V2 Approval Matrix

Existing CTF approvals do NOT carry over to V2:

| Operation | Approval required |
|-----------|-------------------|
| Split | `approve(ROUTER, amount)` on pUSD |
| Merge / redeem | `setApprovalForAll(ROUTER, true)` on PositionManager |
| BUY orders | `approve(EXCHANGE_V3, amount)` on pUSD (covers collateral + fees) |
| SELL orders | `setApprovalForAll(EXCHANGE_V3, true)` on PositionManager |
| AutoRedeemer | `positionManager.setApprovalForAll(AUTO_REDEEMER, true)` |

### V2 Payout Reads & Warnings

- `PositionManager.getPayout(uint256 positionId, uint256 amount) view returns (uint256)` — pUSD payout in base units; unresolved positions can revert, and `0` is a valid losing payout.
- Protocol mints and unsafe transfers do **not** invoke ERC-1155 receiver callbacks — account for balances explicitly.
- Approval alone does not schedule an AutoRedeemer redemption; an authorized operator can redeem full balances and return pUSD to the holder.
- Neg-risk: refresh on `RemainingConditionsDerivableAsNo` / `SyntheticConditionDerivableAsYes` events, then read module `getResult` or `getPayout` — no need to track individual `ConditionResolved` events.

The unified SDK wraps all of this: `client.splitPosition` / `client.mergePositions` (accepts `amount: "max"`) / `client.redeemPositions` handle ABI encoding and approvals.

## Approval Matrix (V1/CTF)

Before trading or CTF operations, the funder must approve the relevant contracts:

| Operation | Contract to Approve | Token |
|-----------|-------------------|-------|
| Buy order (standard) | CTF Exchange | pUSD |
| Sell order (standard) | CTF Exchange | Conditional tokens |
| Buy order (neg risk) | Neg Risk CTF Exchange | pUSD |
| Sell order (neg risk) | Neg Risk CTF Exchange | Conditional tokens |
| Split | CTF (V1) or Router (V2) | pUSD |
| Neg risk conversion | Neg Risk Adapter | Conditional tokens |

## Standard vs Neg Risk Markets

| Feature | Standard Markets | Neg Risk Markets |
|---------|-----------------|------------------|
| CTF Contract | ConditionalTokens | ConditionalTokens |
| Exchange Contract | CTF Exchange | Neg Risk CTF Exchange |
| Multi-outcome | Independent markets | Linked via conversion |
| `negRisk` flag | `false` | `true` |
| Order option | `negRisk: false` | `negRisk: true` |

## Negative Risk

Multi-outcome events where only one outcome can win. A No token in any market can be **converted** into 1 Yes token in every other market.

### Conversion Example

Event: "Who wins?" with outcomes Trump, Harris, Other.

| Outcome | Before | After Conversion |
|---------|--------|------------------|
| Trump | — | 1 Yes |
| Harris | — | 1 Yes |
| Other | 1 No | — |

Conversion is atomic through the Neg Risk Adapter contract.

### Identifying Neg Risk Markets

```json
{
  "negRisk": true   // on event or market object from API
}
```

When placing orders: pass `negRisk: true` in options.

## Augmented Negative Risk

For events where new outcomes emerge after trading begins (e.g., new candidate enters race).

| Outcome Type | Description |
|--------------|-------------|
| Named outcomes | Known outcomes (e.g., "Trump", "Harris") |
| Placeholder outcomes | Reserved slots clarified later (e.g., "Person A") |
| Explicit Other | Catches any unnamed outcome |

### Identifying

```json
{
  "enableNegRisk": true,
  "negRiskAugmented": true
}
```

### Rules
- Only trade on **named outcomes** — ignore placeholders
- If correct outcome is not named at resolution, market resolves to "Other"
- "Other" definition changes as placeholders are clarified — avoid trading it directly

## Token ID Computation

Token IDs are computed onchain in three steps:

1. `getConditionId(oracle, questionId, outcomeSlotCount)` — oracle = UMA CTF Adapter, outcomeSlotCount = 2 for binary
2. `getCollectionId(parentCollectionId, conditionId, indexSet)` — parentCollectionId = bytes32(0), indexSet = 1 (Yes) or 2 (No)
3. `getPositionId(collateralToken, collectionId)` — combines the pUSD collateral address on Polygon with collection

In practice, get token IDs from the Markets API `tokens` array. Manual computation only needed for direct contract interaction.
