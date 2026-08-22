
> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Rate Limits

All limits enforced via Cloudflare throttling (delayed/queued, not immediately rejected). Sliding time windows.

## General

| Endpoint | Limit |
|----------|-------|
| General rate limiting | 15,000 req / 10s |
| Health check (`/ok`) | 100 req / 10s |

## Gamma API (`gamma-api.polymarket.com`)

| Endpoint | Limit |
|----------|-------|
| General | 4,000 req / 10s |
| `/events` | 500 req / 10s |
| `/markets` | 300 req / 10s |
| `/markets` + `/events` listing | 900 req / 10s |
| `/comments` | 200 req / 10s |
| `/tags` | 200 req / 10s |
| `/public-search` | 350 req / 10s |

## Data API (`data-api.polymarket.com`)

| Endpoint | Limit |
|----------|-------|
| General | 1,000 req / 10s |
| `/trades` | 200 req / 10s |
| `/positions` | 150 req / 10s |
| `/closed-positions` | 150 req / 10s |

## CLOB API (`clob.polymarket.com`)

### Market Data

| Endpoint | Limit |
|----------|-------|
| General | 9,000 req / 10s |
| `/book` | 1,500 req / 10s |
| `/books` | 500 req / 10s |
| `/price` | 1,500 req / 10s |
| `/prices` | 500 req / 10s |
| `/midpoint` | 1,500 req / 10s |
| `/midpoints` | 500 req / 10s |
| `/prices-history` | 1,000 req / 10s |
| Market tick size | 200 req / 10s |

### Ledger

| Endpoint | Limit |
|----------|-------|
| `/trades`, `/orders`, `/notifications`, `/order` | 900 req / 10s |
| `/data/orders` | 500 req / 10s |
| `/data/trades` | 500 req / 10s |
| `/notifications` | 125 req / 10s |

### Authentication

| Endpoint | Limit |
|----------|-------|
| API key endpoints | 100 req / 10s |

### Trading (burst + sustained)

| Endpoint | Burst (10s) | Sustained (10min) |
|----------|-------------|-------------------|
| `POST /order` | 3,500 | 36,000 |
| `DELETE /order` | 3,000 | 30,000 |
| `POST /orders` | 1,000 | 15,000 |
| `DELETE /orders` | 1,000 | 15,000 |
| `DELETE /cancel-all` | 250 | 6,000 |
| `DELETE /cancel-market-orders` | 1,000 | 1,500 |

### Other

| Endpoint | Limit |
|----------|-------|
| Relayer `/submit` | 25 req / 1 min |
| User PNL API | 200 req / 10s |
| `GET balance-allowance` | 200 req / 10s |
| `UPDATE balance-allowance` | 50 req / 10s |

## Per-signer trading rate limits (new)

Beyond the IP-based limits above, trading endpoints now enforce **per-signer token buckets** with volume tiers. Responses carry `Poly-RateLimit-Remaining`, `Poly-RateLimit-Reset` and `Poly-RateLimit-Tier` headers. Batch order checks are all-or-nothing. See docs.polymarket.com/api-reference/trading-rate-limits for tier tables; automated traders should read these headers and back off before hitting the bucket.
