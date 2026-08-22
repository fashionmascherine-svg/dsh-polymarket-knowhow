
> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Geographic Restrictions

Polymarket restricts order placement from certain locations. Orders from blocked regions are rejected.

## Geoblock Check

```bash
GET https://polymarket.com/api/geoblock
```

Response:
```json
{
  "blocked": true,
  "ip": "203.0.113.42",
  "country": "US",
  "region": "NY"
}
```

**Note**: This endpoint is on `polymarket.com`, not the API servers.

## Blocked Countries

| Code | Country | Status |
|------|---------|--------|
| AU | Australia | Blocked |
| BE | Belgium | Blocked |
| BY | Belarus | Blocked |
| CU | Cuba | Blocked |
| DE | Germany | Blocked |
| FR | France | Blocked |
| GB | United Kingdom | Blocked |
| IR | Iran | Blocked |
| IT | Italy | Blocked |
| KP | North Korea | Blocked |
| NL | Netherlands | Blocked |
| PL | Poland | Close-only |
| RU | Russia | Blocked |
| SG | Singapore | Close-only |
| TH | Thailand | Close-only |
| TW | Taiwan | Close-only |
| US | United States | Blocked |
| VE | Venezuela | Blocked |

Close-only = can close existing positions but cannot open new ones.

Additional blocked: BI, CF, CD, ET, IQ, LB, LY, MM, NI, SO, SS, SD, SY, UM, YE, ZW.

## Blocked Regions (within otherwise accessible countries)

| Country | Region | Code |
|---------|--------|------|
| Canada (CA) | Ontario | ON |
| Ukraine (UA) | Crimea | 43 |
| Ukraine (UA) | Donetsk | 14 |
| Ukraine (UA) | Luhansk | 09 |

## Usage

```python
import requests

def check_geoblock() -> dict:
    return requests.get("https://polymarket.com/api/geoblock").json()

geo = check_geoblock()
if geo["blocked"]:
    print(f"Trading not available in {geo['country']}")
```

## Why Restricted

- OFAC-sanctioned countries
- Local financial/gambling regulations
- AML/KYC requirements

**Important for Chinese users**: China (CN) is NOT on the blocked list, but access may require VPN due to network restrictions. Always verify with the geoblock endpoint.
