#!/usr/bin/env node
/**
 * Read-only MCP (Model Context Protocol) stdio server for dsh-polymarket-knowhow.
 *
 * Exposes the plugin's read-only Polymarket tools to any MCP client — Claude
 * Code included (via the bundled .mcp.json or `claude mcp add`). The service
 * is constructed with trading/perps disabled, so account/order tools are never
 * registered; a denylist guard additionally refuses to expose anything that
 * matches an account/order tool name even if registration gates change.
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio).
 * Run from the package root after `npm run build`:
 *
 *   node scripts/mcp-server.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { registerTools } from '../lib/tools.js'
import { PolymarketService } from '../lib/service.js'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
const SERVER_NAME = 'polymarket-knowhow'
const SERVER_VERSION = pkg.version

/** Protocol versions this server can speak; newest first. */
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

/** Model-facing cap per tool result, mirroring the DSH renderer budget. */
const MAX_RESULT_CHARS = 24_000

/**
 * Defense-in-depth. These tool-name fragments must never be reachable over
 * MCP even if a future tool slips past the trading/perps registration gates.
 */
const DENIED = /place_order|cancel|heartbeat|api_keys|balance_allowance|account_|perps_account/

/** Convert a dsh-tools parameters map into a JSON Schema inputSchema. */
export function jsonSchemaFromParameters(parameters = {}) {
  const properties = {}
  const required = []
  for (const [name, param] of Object.entries(parameters)) {
    const { required: isRequired, ...schema } = param ?? {}
    properties[name] = schema
    if (isRequired === true) required.push(name)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

function defaultConfig(overrides = {}) {
  return {
    clobUrl: 'https://clob.polymarket.com',
    gammaUrl: 'https://gamma-api.polymarket.com',
    dataApiUrl: 'https://data-api.polymarket.com',
    perpsUrl: 'https://api.perpetuals.polymarket.com',
    rfqUrl: 'https://combos-rfq-api.polymarket.com',
    bridgeUrl: 'https://bridge.polymarket.com',
    relayerUrl: 'https://relayer-v2.polymarket.com',
    geoblockUrl: 'https://polymarket.com/api/geoblock',
    wsMarketUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    wsUserUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/user',
    timeoutMs: 20_000,
    maxRetries: 2,
    userAgent: `${SERVER_NAME}-mcp/${SERVER_VERSION}`,
    // MCP exposure is read-only by design: no credential resolution at all.
    trading: { enabled: false, apiKey: '', secret: '', passphrase: '', address: '', signatureType: 2, allowEnvCredentials: false },
    perps: { enabled: false, proxy: '', secret: '', allowEnvCredentials: false },
    stream: { enabled: false, assetIds: [], pingIntervalMs: 10_000, reconnectDelayMs: 1_000 },
    skills: true,
    ...overrides,
  }
}

export function createMcpServer(configOverrides = {}) {
  const service = new PolymarketService(
    { reflect: { provide() {} }, logger: { warn() {}, info() {} } },
    defaultConfig(configOverrides),
  )
  const registered = new Map()
  registerTools(
    {
      tools: { register: (definition) => registered.set(definition.name, definition) },
      skills: { register() {} },
      logger: { warn() {}, info() {} },
    },
    service,
    { trading: { enabled: false }, perps: { enabled: false } },
  )

  const skipped = []
  const tools = new Map()
  for (const [name, definition] of registered) {
    if (DENIED.test(name)) { skipped.push(name); continue }
    tools.set(name, definition)
  }

  return {
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    service,
    tools,
    skipped,
    listTools() {
      return [...tools.values()].map((definition) => ({
        name: definition.name,
        description: definition.description,
        inputSchema: jsonSchemaFromParameters(definition.parameters),
      }))
    },
    async callTool(name, args = {}, signal) {
      const definition = tools.get(name)
      if (!definition) throw new Error(`Unknown tool: ${name}`)
      return await definition.execute(args, { signal })
    },
  }
}

function respond(id, partial) {
  return { jsonrpc: '2.0', id, ...partial }
}

function textResult(value) {
  let text = JSON.stringify(value, null, 2)
  if (text.length > MAX_RESULT_CHARS) {
    text = text.slice(0, MAX_RESULT_CHARS) + '\n… [truncated by polymarket-knowhow MCP server]'
  }
  return { content: [{ type: 'text', text }] }
}

function errorResult(err) {
  const label = err && err.name === 'PolymarketGeoBlockedError'
    ? 'PolymarketGeoBlockedError (this host/region cannot reach Polymarket APIs)'
    : `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`
  return { content: [{ type: 'text', text: label }], isError: true }
}

export function pickProtocolVersion(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOLS.includes(requested)) return requested
  return SUPPORTED_PROTOCOLS[0]
}

/** Pure JSON-RPC dispatcher — exported for tests; stdio loop feeds it. */
export async function handleMessage(server, message, { callTimeoutMs = 30_000 } = {}) {
  const id = message?.id
  const isNotification = id === undefined || id === null
  const method = message?.method

  switch (method) {
    case 'initialize':
      return respond(id, {
        result: {
          protocolVersion: pickProtocolVersion(message?.params?.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: server.serverInfo,
          instructions:
            'Read-only Polymarket market-data tools (Gamma, CLOB, Data API, Perps public info, Combos/RFQ). '
            + 'Trading/account endpoints are intentionally not exposed. Pair with the polymarket skill for API knowhow.',
        },
      })
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return undefined
    case 'ping':
      return respond(id, { result: {} })
    case 'tools/list':
      return respond(id, { result: { tools: server.listTools() } })
    case 'tools/call': {
      const name = message?.params?.name
      const args = message?.params?.arguments ?? {}
      if (typeof name !== 'string' || !server.tools.has(name)) {
        return respond(id, { result: errorResult(new Error(`Unknown tool: ${String(name)}`)) })
      }
      try {
        const value = await server.callTool(name, args, AbortSignal.timeout(callTimeoutMs))
        return respond(id, { result: textResult(value ?? null) })
      } catch (err) {
        return respond(id, { result: errorResult(err) })
      }
    }
    default:
      if (isNotification) return undefined
      return respond(id, { error: { code: -32601, message: `Method not found: ${String(method)}` } })
  }
}

/** Newline-delimited JSON-RPC loop over an stdin/stdout-like pair. */
export async function startStdio(server, io = process) {
  let buffer = ''
  io.stdin.setEncoding('utf8')
  io.stdin.on('data', (chunk) => {
    buffer += chunk
    let newlineAt = buffer.indexOf('\n')
    while (newlineAt >= 0) {
      const line = buffer.slice(0, newlineAt).trim()
      buffer = buffer.slice(newlineAt + 1)
      if (line) void dispatch(line)
      newlineAt = buffer.indexOf('\n')
    }
  })
  io.stdin.on('end', () => process.exit(0))

  async function dispatch(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      io.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
      return
    }
    const out = await handleMessage(server, message)
    if (out !== undefined) io.stdout.write(JSON.stringify(out) + '\n')
  }
}

const argvPath = process.argv[1] ? resolve(process.argv[1]) : undefined
const isMainModule = argvPath !== undefined && import.meta.url === pathToFileURL(argvPath).href
if (isMainModule) {
  await startStdio(createMcpServer())
}
