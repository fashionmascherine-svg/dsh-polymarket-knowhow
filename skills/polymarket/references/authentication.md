<!-- GENERATED from knowledge/authentication.md by scripts/sync-claude-skill.mjs.
     Do not edit: change knowledge/authentication.md and run npm run sync:claude-skill. -->


> Adapted from [atompilot/polymarket-skill](https://github.com/atompilot/polymarket-skill) (MIT License © atompilot); verified against official Polymarket documentation.

# Authentication

Polymarket uses two-level auth: **L1** (EIP-712 private key signing) to create credentials, **L2** (HMAC-SHA256 API key signing) to authenticate requests. Builder program adds a separate set of **builder headers** for order attribution and relayer access.

## L1 Authentication (Private Key)

L1 proves wallet ownership via EIP-712 signature. Used to create or derive API credentials.

### EIP-712 Domain

```typescript
const domain = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137,
};

const types = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
};

const value = {
  address: signingAddress,       // The signing address
  timestamp: ts,                 // The CLOB API server timestamp
  nonce: nonce,                  // The nonce used
  message: "This message attests that I control the given wallet",
};
```

### L1 Headers

| Header | Description |
|--------|-------------|
| `POLY_ADDRESS` | Polygon signer address |
| `POLY_SIGNATURE` | CLOB EIP-712 signature |
| `POLY_TIMESTAMP` | Current UNIX timestamp |
| `POLY_NONCE` | Nonce (default: 0) |

### Create / Derive Credentials

```typescript
// TypeScript — unified SDK (recommended)
import { createSecureClient } from "@polymarket/client";
import { privateKey } from "@polymarket/client/viem";

const client = await createSecureClient({ signer: privateKey(pk) });
const creds = client.credentials; // { key, secret, passphrase } — store securely
```

```python
# Python
from polymarket import AsyncSecureClient
client = await AsyncSecureClient.create(private_key=pk)
creds = client.credentials
```

**Legacy standalone clients** (`@polymarket/clob-client` / `py-clob-client`, V1/CTF only): `new ClobClient(host, 137, signer).createOrDeriveApiKey()` / `client.create_or_derive_api_creds()`.

**REST endpoints:**
- `POST {host}/auth/api-key` — create new credentials (requires L1 headers)
- `GET {host}/auth/derive-api-key` — derive existing credentials (requires L1 headers)

## L2 Authentication (API Key)

L2 uses HMAC-SHA256 signatures from the API credentials. Required for all `/v1/trade/*` endpoints.

### L2 Headers (all 5 required)

| Header | Description |
|--------|-------------|
| `POLY_ADDRESS` | Polygon signer address |
| `POLY_SIGNATURE` | HMAC signature for request |
| `POLY_TIMESTAMP` | Current UNIX timestamp |
| `POLY_API_KEY` | User's API `apiKey` value |
| `POLY_PASSPHRASE` | User's API `passphrase` value |

### Initialize Trading Client

```typescript
// TypeScript — unified SDK: pass stored creds to avoid re-deriving, and the
// account wallet (funder) that holds the funds.
const client = await createSecureClient({
  wallet: funderAddress,                         // Poly proxy/Safe, Deposit Wallet, or EOA address
  signer: privateKey(pk),
  credentials: { key: creds.key, secret: creds.secret, passphrase: creds.passphrase },
});
// Omit `credentials` to let the SDK derive fresh ones via L1.
// client.account → { signer, wallet, walletType: EOA|POLY_PROXY|GNOSIS_SAFE|DEPOSIT_WALLET }
```

```python
# Python — omits api_key, so credentials are derived via L1; pass
# api_key=RelayerApiKey(...) or BuilderApiKey(...) for those key types.
client = await AsyncSecureClient.create(
    private_key=pk,
    wallet=funder_address,
)
```

**Legacy standalone clients** signature: `new ClobClient(host, 137, signer, apiCreds, signatureType, funderAddress)` / `ClobClient(host, key, chain_id, creds, signature_type, funder)`.

## Signature Types

| Type | Value | When to Use |
|------|-------|-------------|
| EOA | `0` | Standard Ethereum wallet (MetaMask). Funder is the EOA address and will need POL to pay gas on transactions. |
| POLY_PROXY | `1` | A custom proxy wallet only used with users who logged in via Magic Link email/Google. Using this requires the user to have exported their PK from Polymarket.com and imported into your app. |
| GNOSIS_SAFE | `2` | Gnosis Safe multisig proxy wallet (most common). Use this for any new or returning user who does not fit the other 2 types. |

The **funder** is the address holding funds. For proxy wallets, find it at polymarket.com/settings. Proxy wallets are auto-deployed on first Polymarket.com login.

## Builder Headers

Builder authentication is separate from L1/L2. Used for order attribution and relayer access.

### Builder Headers (4 required)

| Header | Description |
|--------|-------------|
| `POLY_BUILDER_API_KEY` | Builder API key |
| `POLY_BUILDER_TIMESTAMP` | Unix timestamp |
| `POLY_BUILDER_PASSPHRASE` | Builder passphrase |
| `POLY_BUILDER_SIGNATURE` | HMAC-SHA256 of request |

### Initialize Client with Builder Config

```typescript
// TypeScript — unified SDK: builder creds are a client option, orders
// automatically include builder headers. NOTE: builderApiKey lives in the
// `@polymarket/client/node` subpath, NOT in the package root (a root import
// throws SyntaxError at module link time on 0.12.0).
import { createSecureClient } from "@polymarket/client";
import { builderApiKey } from "@polymarket/client/node";

const client = await createSecureClient({
  signer: privateKey(pk),
  apiKey: builderApiKey({
    key: process.env.POLYMARKET_BUILDER_API_KEY!,
    secret: process.env.POLYMARKET_BUILDER_SECRET!,
    passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE!,
  }),
});
```

```python
# Python
from polymarket import AsyncSecureClient, BuilderApiKey

client = await AsyncSecureClient.create(
    private_key=pk,
    api_key=BuilderApiKey(
        key=os.environ["POLYMARKET_BUILDER_API_KEY"],
        secret=os.environ["POLYMARKET_BUILDER_SECRET"],
        passphrase=os.environ["POLYMARKET_BUILDER_PASSPHRASE"],
    ),
)
```

Legacy standalone path (superseded): `@polymarket/builder-signing-sdk` / `py-builder-signing-sdk` with `new BuilderConfig({ localBuilderCreds })` passed to `ClobClient`.

### Remote Signing

Keep builder credentials on a separate server. The unified SDK points at your signing endpoint:

```typescript
import { createSecureClient, remoteBuilderSigning } from "@polymarket/client";

const client = await createSecureClient({
  signer,
  apiKey: remoteBuilderSigning({ url: "/api/builder/sign", credentials: "include" }),
});
```

Server side, generate the headers with `buildHmacSignature(secret, timestamp, method, path, body)` (exported from `@polymarket/client`) — the endpoint contract and the 4 `POLY_BUILDER_*` headers are unchanged.

## Credential Lifecycle

- **Unified SDK**: `createSecureClient` creates **or** derives automatically (optionally with `nonce`); read `client.credentials` and store them to skip re-derivation later. Revoke with `endAuthentication()` (returns a `PublicClient`).
- **Legacy standalone clients**: `createApiKey()` (new, with nonce), `deriveApiKey(nonce)`, `createOrDeriveApiKey()`.
- **Builder keys**: revoke via the builder key endpoints (`DELETE /auth/builder-api-key`).

Lost credentials + lost nonce = create fresh credentials. Save your nonce.
