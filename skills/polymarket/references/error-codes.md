<!-- GENERATED from knowledge/error-codes.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/error-codes.md and run npm run sync:claude-skill. -->


> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Error Codes

All CLOB API errors return: `{ "error": "<message>" }`

## Status Code Reference

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 400 | Bad Request | Invalid parameters, malformed payload, business logic violation |
| 401 | Unauthorized | Missing/invalid API key, bad HMAC signature, expired timestamp |
| 404 | Not Found | Market doesn't exist, order not found, token ID not recognized |
| 425 | Too Early | Matching engine restarting — retry with backoff |
| 429 | Too Many Requests | Rate limit exceeded — implement exponential backoff |
| 500 | Internal Server Error | Unexpected server error — retry with backoff |
| 503 | Service Unavailable | Exchange paused or in cancel-only mode |

**Internal override**: any error containing "not found" → 404, "unauthorized" → 401, "context canceled" → 400.

## Global Errors (any authenticated endpoint)

| Code | Error | Fix |
|------|-------|-----|
| 401 | `Unauthorized/Invalid api key` | Check API key headers |
| 401 | `Invalid L1 Request headers` | Fix HMAC signature — see authentication.md |
| 503 | `Trading is currently disabled` | Exchange paused, check polymarket.com |
| 503 | `Trading is currently cancel-only` | Can cancel but not place new orders |
| 429 | `Too Many Requests` | Back off with exponential backoff |

## Order Placement Errors

| Code | Error | Fix |
|------|-------|-----|
| 400 | `Invalid order payload` | Check request body format |
| 400 | `the order owner has to be the owner of the API KEY` | Maker address must match API key |
| 400 | `'{address}' address banned` | Address is banned from trading |
| 400 | `invalid post-only order: order crosses book` | Adjust price so it rests on book |
| 400 | `Price ({price}) breaks minimum tick size rule: {tick}` | Use `GET /tick-size` to check valid tick |
| 400 | `Size ({size}) lower than the minimum: {min}` | Increase order size |
| 400 | `not enough balance / allowance` | Check balance with `GET /balance-allowance` |
| 400 | `invalid nonce` | Nonce already used or invalid |
| 400 | `invalid expiration` | Expiration timestamp is in past |
| 400 | `order couldn't be fully filled. FOK orders are fully filled or killed.` | Insufficient liquidity for FOK |
| 400 | `no orders found to match with FAK order` | No matching orders for FAK |
| 400 | `the market is not yet ready to process new orders` | Market not open for trading yet |

## Matching Engine Errors

| Code | Error | Fix |
|------|-------|-----|
| 425 | `The matching engine is restarting` | Retry with exponential backoff |
| 500 | `there are no matching orders` | No liquidity available |
| 500 | `the trade contains rounding issues` | Adjust order size/price |

## Cancel Errors

| Code | Error | Fix |
|------|-------|-----|
| 400 | `Invalid orderID` | Check order ID format |
| 400 | `Too many orders in payload, max allowed: {N}` | Reduce batch size |

## Market Data Errors

| Code | Error | Fix |
|------|-------|-----|
| 400 | `Invalid token id` | Check token_id parameter |
| 400 | `Invalid side` | Must be `BUY` or `SELL` |
| 400 | `Payload exceeds the limit` | Reduce batch size |
| 404 | `No orderbook exists for the requested token id` | Market may not have CLOB enabled |

## Price History Errors

| Code | Error | Fix |
|------|-------|-----|
| 400 | `startTs is required` | Add startTs parameter |
| 400 | `asset_id is required` | Add asset_id parameter |
| 400 | `invalid fidelity: {val}` | Must be: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, `1w` |
| 400 | `limit cannot exceed 1000` | Reduce limit to ≤1000 |
