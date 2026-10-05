/**
 * Order-signing regression tests with the unified SDK stubbed at the module
 * loader (module.registerHooks — @polymarket/client is an optional peer and is
 * absent from node_modules, so placeOrder would otherwise exit at INSTALL_HINT
 * and the FOK/FAK argument mapping would have zero executable coverage).
 *
 * The stub records every createSecureClient / placeMarketOrder / placeLimitOrder
 * call so the exact wire shapes are pinned: a silent revert of the SELL
 * shares-from-size mapping (the defect class recorded in CHANGELOG 0.3.0) or
 * of the apiKey→key credential mapping fails this file.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const CLIENT_SOURCE = `
const calls = { create: [], market: [], limit: [] }
export const __calls = calls
export const OrderSide = { BUY: 'BUY', SELL: 'SELL' }
export function createSecureClient(opts) {
  calls.create.push(opts)
  return {
    async placeMarketOrder(req) { calls.market.push(req); return { ok: true, orderId: 'M' + calls.market.length } },
    async placeLimitOrder(req) { calls.limit.push(req); return { ok: true, orderId: 'L' + calls.limit.length } },
  }
}
export default {}
`

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@polymarket/client') return { url: 'stub://polymarket/client', shortCircuit: true }
    if (specifier === '@polymarket/client/viem') return { url: 'stub://polymarket/viem', shortCircuit: true }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === 'stub://polymarket/client') return { format: 'module', source: CLIENT_SOURCE, shortCircuit: true }
    if (url === 'stub://polymarket/viem') {
      return { format: 'module', source: 'export function privateKey(k) { return { __privateKey: k } }', shortCircuit: true }
    }
    return nextLoad(url, context, nextLoad)
  },
})

// Import AFTER the hooks are installed.
const { placeOrder, toSdkCredentials } = await import('../../lib/signing.js')
const { __calls } = await import('stub://polymarket/client')

const CONFIG = {
  privateKey: '0xTESTKEY',
  walletAddress: '0xFUNDER',
  creds: { apiKey: 'APIKEY', secret: 'SECRET', passphrase: 'PASSPHRASE' },
}

test('stored credentials reach the SDK boundary in its key shape', async () => {
  assert.deepEqual(
    toSdkCredentials(CONFIG.creds),
    { key: 'APIKEY', secret: 'SECRET', passphrase: 'PASSPHRASE' },
    '@polymarket/client validates credentials.key, not credentials.apiKey',
  )
  await placeOrder(CONFIG, { assetId: 'A', side: 'SELL', size: 1, price: 0.5, orderType: 'FOK' })
  const create = __calls.create.at(-1)
  assert.deepEqual(create.credentials, { key: 'APIKEY', secret: 'SECRET', passphrase: 'PASSPHRASE' }, 'mapped at the real construction call')
  assert.equal(create.wallet, '0xFUNDER')
})

test('FOK/FAK SELL forwards shares from size with price as minPrice', async () => {
  const res = await placeOrder(CONFIG, { assetId: 'A', side: 'SELL', size: 10, price: 0.4, orderType: 'FOK' })
  assert.equal(res.ok, true)
  assert.deepEqual(__calls.market.at(-1), { assetId: 'A', side: 'SELL', shares: '10', minPrice: 0.4 })
})

test('FOK/FAK BUY forwards the pUSD amount and never shares/minPrice', async () => {
  await placeOrder(CONFIG, { assetId: 'B', side: 'BUY', amount: 5, price: 0.9, orderType: 'FAK' })
  assert.deepEqual(__calls.market.at(-1), { assetId: 'B', side: 'BUY', amount: '5' }, 'price is ignored on BUY market orders')
})

test('SELL with both size and amount prefers size (dollars never become shares)', async () => {
  await placeOrder(CONFIG, { assetId: 'C', side: 'SELL', size: 5, amount: 99, price: 0.6, orderType: 'FAK' })
  assert.deepEqual(__calls.market.at(-1), { assetId: 'C', side: 'SELL', shares: '5', minPrice: 0.6 })
})

test('FOK/FAK without an operand fails locally instead of sending "undefined"', async () => {
  const before = __calls.market.length
  await assert.rejects(
    () => placeOrder(CONFIG, { assetId: 'D', side: 'SELL', price: 0.4, orderType: 'FOK' }),
    /requires size/,
  )
  await assert.rejects(
    () => placeOrder(CONFIG, { assetId: 'D', side: 'BUY', orderType: 'FAK' }),
    /requires amount/,
  )
  assert.equal(__calls.market.length, before, 'no SDK call recorded for invalid operands')
})

test('GTC limit forwards price/size/postOnly; GTD adds expiration through placeLimitOrder', async () => {
  await placeOrder(CONFIG, { assetId: 'E', side: 'BUY', price: 0.5, size: 10, orderType: 'GTC', postOnly: true })
  assert.deepEqual(__calls.limit.at(-1), { assetId: 'E', side: 'BUY', price: 0.5, size: 10, postOnly: true })
  const expiration = Math.floor(Date.now() / 1000) + 3600
  await placeOrder(CONFIG, { assetId: 'E', side: 'BUY', price: 0.5, size: 10, orderType: 'GTD', expiration })
  assert.deepEqual(__calls.limit.at(-1), { assetId: 'E', side: 'BUY', price: 0.5, size: 10, postOnly: false, expiration })
})
