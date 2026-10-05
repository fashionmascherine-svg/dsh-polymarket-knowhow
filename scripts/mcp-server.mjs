#!/usr/bin/env node
/**
 * Read-only MCP (Model Context Protocol) stdio server for dsh-polymarket-knowhow.
 *
 * Exposes the plugin's read-only Polymarket tools to any MCP client — Claude
 * Code included (via the bundled .mcp.json or `claude mcp add`).
 *
 * ZERO external dependencies by design: this file imports only the pure-Node
 * client modules (lib/gamma|data|clob|perps|extras|knowledge.js — node builtins
 * only) and re-declares the read-only tool layer inline, mirroring src/tools.ts.
 * It therefore boots in ANY host (Claude Code marketplace installs included)
 * without the @deepseek-ai/* packages that the full DSH plugin resolves from
 * its host application.
 *
 * Trading/account endpoints are unreachable by construction (no credential
 * resolution at all) and a denylist guard refuses to expose anything that
 * matches an account/order tool name.
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { GammaClient } from '../lib/gamma.js'
import { DataApiClient } from '../lib/data.js'
import { ClobClient } from '../lib/clob.js'
import { PerpsClient } from '../lib/perps.js'
import { RfqClient, checkGeoblock } from '../lib/extras.js'
import { loadKnowledgeModule, searchKnowledgeModules, KNOWLEDGE_TOPICS } from '../lib/knowledge.js'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const pkg = JSON.parse(readFileSync(ROOT + '/package.json', 'utf8'))
const SERVER_NAME = 'polymarket-knowhow'
const SERVER_VERSION = pkg.version

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_RESULT_CHARS = 24000
/** Defense-in-depth: never expose these even if the inline set drifts. */
const DENIED = /place_order|cancel|heartbeat|api_keys|balance_allowance|account_|perps_account/
const PRICE_HISTORY_INTERVALS = ['all', '1h', '6h', '1d', '1w', '1m', 'max']

// ── parameter descriptor helpers (same shapes as src/tools.ts) ────────────
const str = (description, required = false) => required ? { type: 'string', description, required: true } : { type: 'string', description }
const num = (description, required = false) => required ? { type: 'number', description, required: true } : { type: 'number', description }
const bool = (description) => ({ type: 'boolean', description })
const enumParam = (values, description, required = false) => required ? { type: 'string', enum: values, description, required: true } : { type: 'string', enum: values, description }
const strArray = (description) => ({ type: 'array', items: { type: 'string' }, description })

// ── Gamma response pruning (ported from src/tools.ts) ─────────────────────
function pruneEvent(event, includeMarkets) {
  const copy = { ...event }
  if (!includeMarkets && Array.isArray(copy.markets)) delete copy.markets
  else if (Array.isArray(copy.markets)) copy.markets = copy.markets.map((m) => pruneMarket(m))
  if (typeof copy.description === 'string' && copy.description.length > 1200) {
    copy.description = copy.description.slice(0, 1200) + '…'
  }
  return copy
}

function pruneMarket(market) {
  const copy = { ...market }
  if (typeof copy.description === 'string' && copy.description.length > 1200) {
    copy.description = copy.description.slice(0, 1200) + '…'
  }
  if (Array.isArray(copy.events)) delete copy.events
  return copy
}

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

export function createMcpServer(configOverrides = {}) {
  const http = {
    timeoutMs: configOverrides.timeoutMs ?? 20000,
    maxRetries: configOverrides.maxRetries ?? 2,
    userAgent: `${SERVER_NAME}-mcp/${SERVER_VERSION}`,
  }
  // Public endpoints plus throwaway perps credentials: the perps routes we
  // expose are public market data; nothing here can touch account state.
  const perpsCredentials = { proxy: '0x0000000000000000000000000000000000000001', secret: 'dummy-secret-for-public-info' }

  /** Service-shaped facade over the pure-Node clients (mirrors lib/service.js). */
  const service = {
    tradingCredentials: undefined,
    perpsCredentials,
    clobUrl: 'https://clob.polymarket.com',
    gamma: new GammaClient('https://gamma-api.polymarket.com', http),
    dataApi: new DataApiClient('https://data-api.polymarket.com', http),
    clob: new ClobClient('https://clob.polymarket.com', http, undefined),
    perps: new PerpsClient('https://api.perpetuals.polymarket.com', http, perpsCredentials),
    rfq: new RfqClient('https://combos-rfq-api.polymarket.com', http),
    geoblock: (signal) => checkGeoblock('https://polymarket.com/api/geoblock', http, signal),
  }

  /** Read-only tool set, mirrored from src/tools.ts (trading excluded). */
  const definitions = [
    {
      name: 'polymarket_search',
      description: 'Search Polymarket events, markets and profiles by keyword (Gamma public-search). Returns matched events, tags, and profiles.',
      parameters: {
        query: str('Free-text search query', true),
        events_status: enumParam(['active', 'closed'], 'Filter events by status'),
        limit_per_type: num('Max results per result type (default 10)'),
        page: num('Result page (1-based)'),
      },
      async execute(args) {
        return await service.gamma.search({ q: args.query, eventsStatus: args.events_status, limitPerType: args.limit_per_type, page: args.page })
      },
    },
    {
      name: 'polymarket_events_list',
      description: 'List Polymarket events (an event groups related markets, e.g. "Fed decision in September"). Supports filters and both offset and keyset pagination. Sort fields are camelCase like volume24hr (NOT volume_24hr).',
      parameters: {
        slug: str('Get the event with this URL slug'),
        tag_id: str('Filter by tag id'),
        series_id: str('Filter by series id (e.g. sports)'),
        active: bool('Only active events (default true)'),
        closed: bool('Include closed events (default false)'),
        live: bool('Keyset mode only: currently-live events'),
        title_search: str('Keyset mode only: substring title search'),
        order: enumParam(['volume24hr', 'volume', 'liquidity', 'startDate', 'endDate', 'competitive', 'closedTime'], 'Sort field (camelCase)'),
        ascending: bool('Sort ascending (default false)'),
        limit: num('Page size, 1-500 (default 20)'),
        offset: num('Offset-pagination position (ignored in keyset mode)'),
        after_cursor: str('Keyset-mode cursor from a previous response'),
        include_markets: bool("Embed each event's markets (larger response, default true)"),
      },
      async execute(args) {
        const includeMarkets = args.include_markets ?? true
        if (args.after_cursor !== undefined || args.live === true || args.title_search !== undefined) {
          return await service.gamma.listEventsKeyset({
            limit: args.limit, order: args.order, ascending: args.ascending,
            afterCursor: args.after_cursor, live: args.live, titleSearch: args.title_search,
            tagId: args.tag_id, seriesId: args.series_id,
          })
        }
        const events = await service.gamma.listEvents({
          limit: args.limit, offset: args.offset, order: args.order, ascending: args.ascending,
          active: args.active, closed: args.closed, tagId: args.tag_id, slug: args.slug, seriesId: args.series_id,
        })
        return { count: events.length, events: events.map((e) => pruneEvent(e, includeMarkets)) }
      },
    },
    {
      name: 'polymarket_event_get',
      description: 'Get one Polymarket event by numeric id or URL slug, including all of its markets, prices and metadata.',
      parameters: { event_id: str('Numeric event id'), slug: str('Event URL slug (from polymarket.com/event/{slug})') },
      async execute(args) {
        if (args.event_id !== undefined) return await service.gamma.getEvent(args.event_id)
        if (args.slug !== undefined) return (await service.gamma.getEventBySlug(args.slug))[0] ?? null
        throw new Error('Provide either event_id or slug')
      },
    },
    {
      name: 'polymarket_markets_list',
      description: 'List Polymarket markets. Filter by condition ids or CLOB token ids to resolve specific markets; otherwise browse with filters. Sort fields are camelCase like volume24hr.',
      parameters: {
        condition_ids: strArray('Filter by market condition ids (0x…)'),
        clob_token_ids: strArray('Filter by CLOB token ids (decimal strings)'),
        slug: str('Exact market slug'),
        tag_id: str('Filter by tag id'),
        active: bool('Only active markets (default true)'),
        closed: bool('Include closed markets (default false)'),
        order: enumParam(['volume24hr', 'volume', 'liquidity', 'startDate', 'endDate', 'spread', 'lastTradePrice', 'bestBid', 'bestAsk', 'competitive'], 'Sort field (camelCase)'),
        ascending: bool('Sort ascending (default false)'),
        limit: num('Page size, 1-100 (default 20)'),
        offset: num('Pagination offset'),
      },
      async execute(args) {
        if ((args.condition_ids?.length ?? 0) > 0 || (args.clob_token_ids?.length ?? 0) > 0) {
          const markets = await service.gamma.listMarketsByIds({ conditionIds: args.condition_ids, clobTokenIds: args.clob_token_ids, limit: args.limit, offset: args.offset })
          return { count: markets.length, markets: markets.map(pruneMarket) }
        }
        const markets = await service.gamma.listMarkets({
          limit: args.limit, offset: args.offset, order: args.order, ascending: args.ascending,
          active: args.active, closed: args.closed, slug: args.slug, tagId: args.tag_id,
        })
        return { count: markets.length, markets: markets.map(pruneMarket) }
      },
    },
    {
      name: 'polymarket_market_get',
      description: 'Get one Polymarket market by numeric id or URL slug: outcomes, prices, tick size, neg-risk flag, acceptingOrders and more.',
      parameters: { market_id: str('Numeric market id'), market_slug: str('Market URL slug') },
      async execute(args) {
        if (args.market_slug !== undefined) return pruneMarket(await service.gamma.getMarketBySlug(args.market_slug))
        if (args.market_id !== undefined) return pruneMarket(await service.gamma.getMarket(args.market_id))
        throw new Error('Provide either market_id or market_slug')
      },
    },
    {
      name: 'polymarket_tags_list',
      description: 'Browse Polymarket tag categories used for filtering events (Politics, Sports, Crypto, …).',
      parameters: { limit: num('Page size (default 50)'), offset: num('Pagination offset') },
      async execute(args) {
        const tags = await service.gamma.listTags({ limit: args.limit ?? 50, offset: args.offset })
        return { count: tags.length, tags }
      },
    },
    {
      name: 'polymarket_orderbook',
      description: 'Get the live CLOB order book for one or more outcome tokens (bids/asks with sizes, tick size, min order size).',
      parameters: {
        token_id: str('Single CLOB token id (decimal string)'),
        token_ids: strArray('Up to 20 token ids for a batch lookup'),
      },
      async execute(args) {
        if ((args.token_ids?.length ?? 0) > 0) return { books: await service.clob.getBooks(args.token_ids) }
        if (args.token_id !== undefined) return await service.clob.getBook(args.token_id)
        throw new Error('Provide token_id or token_ids')
      },
    },
    {
      name: 'polymarket_price',
      description: 'Best executable price for outcome tokens: BUY side returns the best ask, SELL side the best bid. Single or batch.',
      parameters: {
        token_id: str('Single CLOB token id'),
        token_ids: strArray('Batch: token ids (each priced for the same side)'),
        side: enumParam(['BUY', 'SELL'], 'Which side to quote', true),
      },
      async execute(args) {
        const side = String(args.side).toUpperCase() === 'SELL' ? 'SELL' : 'BUY'
        if ((args.token_ids?.length ?? 0) > 0) return { prices: await service.clob.getPrices(args.token_ids.map((id) => ({ tokenId: id, side }))) }
        if (args.token_id !== undefined) return await service.clob.getPrice(args.token_id, side)
        throw new Error('Provide token_id or token_ids')
      },
    },
    {
      name: 'polymarket_quote',
      description: 'Composite quote for outcome tokens: midpoint, spread and last trade price in one call. Use this instead of three separate lookups.',
      parameters: { token_id: str('CLOB token id', true) },
      async execute(args) {
        const [mid, spread, last] = await Promise.all([
          service.clob.getMidpoint(args.token_id),
          service.clob.getSpread(args.token_id),
          service.clob.getLastTradePrice(args.token_id),
        ])
        return { token_id: args.token_id, mid: mid.mid, spread: spread.spread, last_trade: last }
      },
    },
    {
      name: 'polymarket_price_history',
      description: 'Historical price series for an outcome token. Give an interval (1h..max) OR explicit start/end unix timestamps; fidelity is minutes between points.',
      parameters: {
        token_id: str('CLOB token id (the `market` parameter)', true),
        interval: enumParam(PRICE_HISTORY_INTERVALS, 'Lookback window; mutually exclusive with start_ts/end_ts'),
        start_ts: num('Range start, unix seconds'),
        end_ts: num('Range end, unix seconds'),
        fidelity: num('Minutes between data points (default 1)'),
      },
      async execute(args) {
        return await service.clob.getPricesHistory({ market: args.token_id, interval: args.interval, startTs: args.start_ts, endTs: args.end_ts, fidelity: args.fidelity })
      },
    },
    {
      name: 'polymarket_token_info',
      description: 'Resolve a CLOB token id to its market and read trading constraints: minimum tick size, neg-risk flag, fee rate.',
      parameters: { token_id: str('CLOB token id', true) },
      async execute(args) {
        const [tickSize, negRisk, marketInfo] = await Promise.all([
          service.clob.getTickSize(args.token_id),
          service.clob.getNegRisk(args.token_id),
          service.clob.getMarketByToken(args.token_id).catch(() => null),
        ])
        return { token_id: args.token_id, ...tickSize, ...negRisk, market: marketInfo }
      },
    },
    {
      name: 'polymarket_positions',
      description: 'Positions for a Polygon wallet address (proxy wallet) from Data API v2, with current value, PnL breakdown, status lifecycle and redeemable flags. Pagination is cursor-based.',
      parameters: {
        user: str('Wallet/proxy address (0x…)'),
        condition: str('Filter by condition id (0x…) — up to 20 comma-separated'),
        status: enumParam(['OPEN', 'REDEEMABLE', 'REDEEMABLE_LOST', 'MERGEABLE', 'CLOSED'], 'Position lifecycle filter (CLOSED replaces the retired /closed-positions route)'),
        redeemable: bool('Only redeemable positions'),
        sort_by: enumParam(['CURRENT_VALUE', 'TOTAL_PNL', 'REALIZED_PNL', 'UNREALIZED_PNL'], 'Sort key (v2 snake_case values)'),
        sort_direction: enumParam(['ASC', 'DESC'], 'Sort direction'),
        size_threshold_min: num('Ignore positions smaller than this size'),
        limit: num('Page size (default 20, max 500)'),
        cursor: str('Opaque cursor from a previous response (v2 is cursor-only)'),
      },
      async execute(args) {
        const page = await service.dataApi.positions({
          user: args.user, condition: args.condition, status: args.status, redeemable: args.redeemable,
          sortBy: args.sort_by, sortDirection: args.sort_direction,
          sizeThreshold: args.size_threshold_min, limit: args.limit, cursor: args.cursor,
        })
        const rows = Array.isArray(page.data) ? page.data : []
        return { count: rows.length, positions: rows, pagination: page.pagination }
      },
    },
    {
      name: 'polymarket_trades_public',
      description: 'Public trade history filtered by user wallet and/or market condition id (Data API v2). Includes taker-only filtering and price/size per fill. Pagination is cursor-based.',
      parameters: {
        user: str('Wallet/proxy address (0x…)'),
        condition: str('Condition id (0x…) — up to 20 comma-separated'),
        side: enumParam(['BUY', 'SELL'], 'Trade side filter'),
        taker_only: bool('Only taker trades'),
        limit: num('Page size (default 25, max 500)'),
        cursor: str('Opaque cursor from a previous response (v2 is cursor-only)'),
      },
      async execute(args) {
        const page = await service.dataApi.trades({
          user: args.user, condition: args.condition, side: args.side,
          takerOnly: args.taker_only, limit: args.limit, cursor: args.cursor,
        })
        const rows = Array.isArray(page.data) ? page.data : []
        return { count: rows.length, trades: rows, pagination: page.pagination }
      },
    },
    {
      name: 'polymarket_activity',
      description: 'On-chain activity feed for a wallet (Data API v2): TRADE, SPLIT, MERGE, REDEEM, CONVERSION, REWARD events with timestamps and tx hashes. Cursor-based pagination. Note: production accepts exactly ONE type per request — call once per type instead of passing several.',
      parameters: {
        user: str('Wallet/proxy address (0x…)', true),
        type: str('Single activity type to filter (TRADE|SPLIT|MERGE|REDEEM|CONVERSION|REWARD) — one per request'),
        condition: str('Filter by condition id (0x…)'),
        side: enumParam(['BUY', 'SELL'], 'Trade side filter'),
        limit: num('Page size (default 25)'),
        cursor: str('Opaque cursor from a previous response (v2 is cursor-only)'),
      },
      async execute(args) {
        const page = await service.dataApi.activity({
          user: args.user, type: args.type !== undefined ? [args.type] : undefined, conditionId: args.condition, side: args.side,
          limit: args.limit, cursor: args.cursor,
        })
        return { activity: page.data ?? [], pagination: page.pagination }
      },
    },
    {
      name: 'polymarket_holders',
      description: 'Top holders for one or more markets (Data API v2; full 32-byte condition ids required, param `condition`).',
      parameters: {
        condition: str('Condition id (0x…)', true),
        limit: num('Holders per market (default 10, max 20)'),
        include_pnl: bool('Include entry price and PnL per holder'),
      },
      async execute(args) {
        return await service.dataApi.holders({ condition: args.condition, limit: args.limit, includePnl: args.include_pnl })
      },
    },
    {
      name: 'polymarket_leaderboard',
      description: 'Trader leaderboard rankings by profit/volume for a time window (Data API v2).',
      parameters: {
        window: enumParam(['all', 'month', 'week', 'day'], 'Ranking window (default all)'),
        limit: num('Number of traders (default 25)'),
        cursor: str('Opaque cursor from a previous response'),
      },
      async execute(args) {
        return await service.dataApi.leaderboard({ timePeriod: args.window?.toUpperCase(), limit: args.limit, cursor: args.cursor })
      },
    },
    {
      name: 'polymarket_open_interest',
      description: 'Open interest (Data API v2): globally, for one market (condition id), by event slug, or by event id.',
      parameters: {
        global: bool('Return global open interest'),
        condition: str('Condition id (0x…)'),
        slug: str('Market/event slug'),
        event_id: str('Numeric event id'),
      },
      async execute(args) {
        return await service.dataApi.openInterest({ global: args.global, condition: args.condition, slug: args.slug, eventId: args.event_id })
      },
    },
    {
      name: 'polymarket_live_volume',
      description: 'Live in-game trading volume for an event (sports/live markets), total plus per-market breakdown.',
      parameters: { event_id: str('Numeric event id', true) },
      async execute(args) {
        return await service.dataApi.liveVolume(args.event_id)
      },
    },
    {
      name: 'polymarket_portfolio_value',
      description: "Total USD value of a wallet's Polymarket positions (Data API v2 /v2/value).",
      parameters: { user: str('Wallet/proxy address (0x…)', true) },
      async execute(args) {
        return { value: await service.dataApi.value(args.user) }
      },
    },
    {
      name: 'polymarket_user_stats',
      description: 'User stats from Data API v2: distinct markets traded, biggest win, join date and the full all-time PnL breakdown (realized/unrealized, fees, rebates).',
      parameters: { user: str('Wallet/proxy address (0x…)', true) },
      async execute(args) {
        return { stats: await service.dataApi.userStats(args.user) }
      },
    },
    {
      name: 'polymarket_resolutions',
      description: 'Resolution rows for one or more markets (Data API v2): status (inactive/active/resolved), payout vector in 6-decimal base units, resolution source. Only trust payouts from rows with status "resolved".',
      parameters: {
        condition_ids: strArray('Condition ids (0x…)'),
        limit: num('Page size'),
        cursor: str('Opaque cursor from a previous response'),
      },
      async execute(args) {
        if ((args.condition_ids?.length ?? 0) === 0) throw new Error('Provide at least one condition id')
        return await service.dataApi.resolutions({ conditionIds: args.condition_ids, limit: args.limit, cursor: args.cursor })
      },
    },
    {
      name: 'polymarket_approvals',
      description: 'Token approval state of a wallet across the Polymarket contracts (Data API v2): pUSD allowances, exchange operators, per-approval amounts.',
      parameters: { user: str('Wallet/proxy address (0x…)', true) },
      async execute(args) {
        return { approvals: await service.dataApi.approvals(args.user) }
      },
    },
    {
      name: 'polymarket_geoblock_check',
      description: 'Check whether requests from this machine are geoblocked by Polymarket (returns blocked flag, country and region).',
      parameters: {},
      async execute(_args, exec) {
        return await service.geoblock(exec?.signal)
      },
    },
    {
      name: 'polymarket_combo_markets',
      description: 'List combinatorial ("combo") RFQ markets — multi-outcome combination markets traded through the RFQ API.',
      parameters: { limit: num('Page size'), cursor: str('Cursor from a previous response') },
      async execute(args) {
        return await service.rfq.comboMarkets({ limit: args.limit, cursor: args.cursor })
      },
    },
    {
      name: 'polymarket_knowledge',
      description: 'Read the bundled Polymarket knowhow: authentication flows, order patterns, WebSocket channels, fees, CTF operations, bridge, gasless transactions, error codes, rate limits, geoblock rules, Perps and RFQ APIs. Load a topic or search across topics.',
      parameters: {
        topic: enumParam(KNOWLEDGE_TOPICS, 'Knowledge module to read'),
        query: str('Search term; returns matching excerpts across modules instead of loading one'),
      },
      async execute(args) {
        if (args.query !== undefined && args.query.length > 0) return { matches: await searchKnowledgeModules(args.query) }
        if (args.topic === undefined) return { topics: KNOWLEDGE_TOPICS, hint: 'Pass a topic to load it, or query= to search across topics.' }
        return { topic: args.topic, content: await loadKnowledgeModule(args.topic) }
      },
    },
    {
      name: 'polymarket_perps_market_data',
      description: 'Polymarket Perps (perpetual futures) public market data: instruments, tickers, best-bid-offer, book, klines, recent trades, funding history, index, statistics, fees.',
      parameters: {
        endpoint: enumParam(['ping', 'time', 'exchange', 'assets', 'instruments', 'tickers', 'bbo', 'book', 'klines', 'trades', 'mark-history', 'funding', 'index', 'statistics', 'fees', 'portfolio'], 'Info endpoint', true),
        instrument_id: num('Numeric instrument id from `instruments` (required for bbo/book/klines/trades/mark-history/funding; live-verified: symbolic ids are rejected)'),
        interval: str('klines/mark-history interval: 1s|1m|5m|15m|30m|1h|4h|6h|12h|1d|1w'),
        start_timestamp: num('epoch milliseconds (required for klines/mark-history)'),
        end_timestamp: num('epoch milliseconds'),
        depth: num('book depth levels'),
        asset: str('index: base asset symbol (e.g. SP500)'),
        address: str('portfolio: public wallet address'),
      },
      async execute(args) {
        const p = service.perps
        switch (args.endpoint) {
          case 'ping': return { pong: await p.ping() }
          case 'time': return { time: await p.serverTime() }
          case 'exchange': return { exchange: await p.exchangeInfo() }
          case 'assets': return { assets: await p.collateralAssets() }
          case 'instruments': return { instruments: await p.instruments() }
          case 'tickers': return { tickers: await p.tickers(args.instrument_id !== undefined ? { instrument_id: args.instrument_id } : {}) }
          case 'bbo':
            if (args.instrument_id === undefined) throw new Error('bbo requires instrument_id')
            return { bbo: await p.bestBidOffer({ instrument_id: args.instrument_id }) }
          case 'book':
            if (args.instrument_id === undefined) throw new Error('book requires instrument_id')
            return { book: await p.book({ instrument_id: args.instrument_id, depth: args.depth }) }
          case 'klines':
            if (args.instrument_id === undefined || args.interval === undefined || args.start_timestamp === undefined) throw new Error('klines requires instrument_id, interval and start_timestamp')
            return { klines: await p.klines({ instrument_id: args.instrument_id, interval: args.interval, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
          case 'trades':
            if (args.instrument_id === undefined) throw new Error('trades requires instrument_id')
            return { trades: await p.recentTrades({ instrument_id: args.instrument_id, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
          case 'mark-history':
            if (args.instrument_id === undefined || args.interval === undefined || args.start_timestamp === undefined) throw new Error('mark-history requires instrument_id, interval and start_timestamp')
            return { mark_history: await p.markPriceHistory({ instrument_id: args.instrument_id, interval: args.interval, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
          case 'funding':
            if (args.instrument_id === undefined) throw new Error('funding requires instrument_id')
            return { funding: await p.fundingHistory({ instrument_id: args.instrument_id, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
          case 'index':
            if (args.asset === undefined) throw new Error('index requires asset')
            return { index: await p.index({ asset: args.asset }) }
          case 'statistics': return { statistics: await p.statistics(args.instrument_id !== undefined ? { instrument_id: args.instrument_id } : {}) }
          case 'fees': return { fees: await p.fees() }
          case 'portfolio':
            if (args.address === undefined) throw new Error('portfolio requires address')
            return { portfolio: await p.publicPortfolio(args.address) }
          default: throw new Error('Unknown perps endpoint: ' + args.endpoint)
        }
      },
    },
  ]

  const skipped = []
  const tools = new Map()
  for (const definition of definitions) {
    if (DENIED.test(definition.name)) { skipped.push(definition.name); continue }
    tools.set(definition.name, definition)
  }

  return {
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    /** Parity surface for tests: no credentials exist anywhere in this server. */
    service: { tradingCredentials: undefined, perpsCredentials: undefined },
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
export async function handleMessage(server, message, { callTimeoutMs = 30000 } = {}) {
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
  let stdinEnded = false
  let inFlight = 0
  io.stdin.setEncoding('utf8')
  io.stdin.on('data', (chunk) => {
    buffer += chunk
    let newlineAt = buffer.indexOf('\n')
    while (newlineAt >= 0) {
      const line = buffer.slice(0, newlineAt).trim()
      buffer = buffer.slice(newlineAt + 1)
      if (line) { inFlight++; Promise.resolve(dispatch(line)).catch(() => {}).finally(() => { inFlight--; maybeExit() }) }
      newlineAt = buffer.indexOf('\n')
    }
  })
  io.stdin.on('end', () => { stdinEnded = true; maybeExit() })

  function maybeExit() {
    if (stdinEnded && inFlight === 0) process.exit(0)
  }

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
