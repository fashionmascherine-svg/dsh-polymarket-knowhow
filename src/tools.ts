/**
 * Model-facing Polymarket tools.
 *
 * Read-only market-data tools are always registered. Account/trading tools
 * register only when `trading.enabled` AND complete L2 credentials resolve;
 * Perps tools follow the same pattern under `perps.enabled`. Every tool
 * honors `exec.signal`, returns one canonical JSON value declared by its
 * output schema, and renders bounded model-facing text.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Config } from './config.js'
import type { PolymarketService } from './service.js'
import { GammaEvent, GammaMarket } from './gamma.js'
import { PRICE_HISTORY_INTERVALS } from './clob.js'
import { placeOrder as sdkPlaceOrder } from './signing.js'
import { loadKnowledgeModule, searchKnowledgeModules, KNOWLEDGE_TOPICS } from './knowledge.js'

/** Maximum characters of model-facing rendered text per result. */
const MAX_RENDER_CHARS = 24_000

function renderJson(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  let text = JSON.stringify(value, null, 2)
  if (text.length > MAX_RENDER_CHARS) {
    text = text.slice(0, MAX_RENDER_CHARS) + '\n… [truncated — narrow your query (limit/cursor/filters) for complete results]'
  }
  return [{ type: 'text', text }]
}

const jsonOutput = {
  schema: { type: 'json' as const },
  render: renderJson,
}

const jsonOrNullOutput = {
  schema: { type: 'json' as const },
  render: renderJson,
}

function str(description: string): { type: 'string'; description: string }
function str(description: string, required: true): { type: 'string'; description: string; required: true }
function str(description: string, required = false) {
  return required
    ? { type: 'string' as const, description, required: true as const }
    : { type: 'string' as const, description }
}
function num(description: string): { type: 'number'; description: string }
function num(description: string, required: true): { type: 'number'; description: string; required: true }
function num(description: string, required = false) {
  return required
    ? { type: 'number' as const, description, required: true as const }
    : { type: 'number' as const, description }
}
function bool(description: string) {
  return { type: 'boolean' as const, description }
}
function enumParam(values: readonly string[], description: string): { type: 'string'; enum: readonly string[]; description: string }
function enumParam(values: readonly string[], description: string, required: true): { type: 'string'; enum: readonly string[]; description: string; required: true }
function enumParam(values: readonly string[], description: string, required = false) {
  return required
    ? { type: 'string' as const, enum: values, description, required: true as const }
    : { type: 'string' as const, enum: values, description }
}
function strArray(description: string) {
  return { type: 'array' as const, items: { type: 'string' as const }, description }
}

/** Trim noisy fields from Gamma events so listings stay readable. */
function pruneEvent(event: GammaEvent, includeMarkets: boolean): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...event }
  if (!includeMarkets && Array.isArray(copy.markets)) delete copy.markets
  else if (Array.isArray(copy.markets)) {
    copy.markets = (copy.markets as GammaMarket[]).map((m) => pruneMarket(m))
  }
  if (typeof copy.description === 'string' && copy.description.length > 1200) {
    copy.description = copy.description.slice(0, 1200) + '…'
  }
  return copy
}

function pruneMarket(market: GammaMarket): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...market }
  if (typeof copy.description === 'string' && copy.description.length > 1200) {
    copy.description = copy.description.slice(0, 1200) + '…'
  }
  if (Array.isArray(copy.events)) delete copy.events
  return copy
}

export function registerTools(ctx: Context, service: PolymarketService, config: Config): void {
  // ── Discovery: search / events / markets / tags ────────────────────────

  ctx.tools.register(defineTool({
    name: 'polymarket_search',
    description: 'Search Polymarket events, markets and profiles by keyword (Gamma public-search). Returns matched events, tags, and profiles.',
    parameters: {
      query: str('Free-text search query', true),
      events_status: enumParam(['active', 'closed'], 'Filter events by status'),
      limit_per_type: num('Max results per result type (default 10)'),
      page: num('Result page (1-based)'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.gamma.search({
        q: args.query,
        eventsStatus: args.events_status as 'active' | 'closed' | undefined,
        limitPerType: args.limit_per_type,
        page: args.page,
      })
    },
  }))

  ctx.tools.register(defineTool({
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
      include_markets: bool('Embed each event\'s markets (larger response, default true)'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const includeMarkets = args.include_markets ?? true
      if (args.after_cursor !== undefined || args.live === true || args.title_search !== undefined) {
        const page = await service.gamma.listEventsKeyset({
          limit: args.limit,
          order: args.order,
          ascending: args.ascending,
          afterCursor: args.after_cursor,
          live: args.live,
          titleSearch: args.title_search,
          tagId: args.tag_id,
          seriesId: args.series_id,
        })
        return page
      }
      const events = await service.gamma.listEvents({
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        ascending: args.ascending,
        active: args.active,
        closed: args.closed,
        tagId: args.tag_id,
        slug: args.slug,
        seriesId: args.series_id,
      })
      return { count: events.length, events: events.map((e) => pruneEvent(e, includeMarkets)) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_event_get',
    description: 'Get one Polymarket event by numeric id or URL slug, including all of its markets, prices and metadata.',
    parameters: {
      event_id: str('Numeric event id'),
      slug: str('Event URL slug (from polymarket.com/event/{slug})'),
    },
    output: jsonOrNullOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if (args.event_id !== undefined) return await service.gamma.getEvent(args.event_id)
      if (args.slug !== undefined) {
        const found = await service.gamma.getEventBySlug(args.slug)
        return found[0] ?? null
      }
      throw new Error('Provide either event_id or slug')
    },
  }))

  ctx.tools.register(defineTool({
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
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if ((args.condition_ids?.length ?? 0) > 0 || (args.clob_token_ids?.length ?? 0) > 0) {
        const markets = await service.gamma.listMarketsByIds({
          conditionIds: args.condition_ids,
          clobTokenIds: args.clob_token_ids,
          limit: args.limit,
          offset: args.offset,
        })
        return { count: markets.length, markets: markets.map(pruneMarket) }
      }
      const markets = await service.gamma.listMarkets({
        limit: args.limit,
        offset: args.offset,
        order: args.order,
        ascending: args.ascending,
        active: args.active,
        closed: args.closed,
        slug: args.slug,
        tagId: args.tag_id,
      })
      return { count: markets.length, markets: markets.map(pruneMarket) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_market_get',
    description: 'Get one Polymarket market by numeric id or URL slug: outcomes, prices, tick size, neg-risk flag, acceptingOrders and more.',
    parameters: {
      market_id: str('Numeric market id'),
      market_slug: str('Market URL slug'),
    },
    output: jsonOrNullOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if (args.market_slug !== undefined) return pruneMarket(await service.gamma.getMarketBySlug(args.market_slug))
      if (args.market_id !== undefined) return pruneMarket(await service.gamma.getMarket(args.market_id))
      throw new Error('Provide either market_id or market_slug')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_tags_list',
    description: 'Browse Polymarket tag categories used for filtering events (Politics, Sports, Crypto, …).',
    parameters: {
      limit: num('Page size (default 50)'),
      offset: num('Pagination offset'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const tags = await service.gamma.listTags({ limit: args.limit ?? 50, offset: args.offset })
      return { count: tags.length, tags }
    },
  }))

  // ── CLOB market data ────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'polymarket_orderbook',
    description: 'Get the live CLOB order book for one or more outcome tokens (bids/asks with sizes, tick size, min order size).',
    parameters: {
      token_id: str('Single CLOB token id (decimal string)'),
      token_ids: strArray('Up to 20 token ids for a batch lookup'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if ((args.token_ids?.length ?? 0) > 0) {
        return { books: await service.clob.getBooks(args.token_ids!) }
      }
      if (args.token_id !== undefined) return await service.clob.getBook(args.token_id)
      throw new Error('Provide token_id or token_ids')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_price',
    description: 'Best executable price for outcome tokens: BUY side returns the best ask, SELL side the best bid. Single or batch.',
    parameters: {
      token_id: str('Single CLOB token id'),
      token_ids: strArray('Batch: token ids (each priced for the same side)'),
      side: enumParam(['BUY', 'SELL'], 'Which side to quote', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const side = args.side.toUpperCase() === 'SELL' ? 'SELL' : 'BUY'
      if ((args.token_ids?.length ?? 0) > 0) {
        const prices = await service.clob.getPrices(args.token_ids!.map((id) => ({ tokenId: id, side })))
        return { prices }
      }
      if (args.token_id !== undefined) return await service.clob.getPrice(args.token_id, side)
      throw new Error('Provide token_id or token_ids')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_quote',
    description: 'Composite quote for outcome tokens: midpoint, spread and last trade price in one call. Use this instead of three separate lookups.',
    parameters: {
      token_id: str('CLOB token id', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const [mid, spread, last] = await Promise.all([
        service.clob.getMidpoint(args.token_id),
        service.clob.getSpread(args.token_id),
        service.clob.getLastTradePrice(args.token_id),
      ])
      return { token_id: args.token_id, mid: mid.mid, spread: spread.spread, last_trade: last }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_price_history',
    description: 'Historical price series for an outcome token. Give an interval (1h..max) OR explicit start/end unix timestamps; fidelity is minutes between points.',
    parameters: {
      token_id: str('CLOB token id (the `market` parameter)', true),
      interval: enumParam(PRICE_HISTORY_INTERVALS, 'Lookback window; mutually exclusive with start_ts/end_ts'),
      start_ts: num('Range start, unix seconds'),
      end_ts: num('Range end, unix seconds'),
      fidelity: num('Minutes between data points (default 1)'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.clob.getPricesHistory({
        market: args.token_id,
        interval: args.interval as typeof PRICE_HISTORY_INTERVALS[number] | undefined,
        startTs: args.start_ts,
        endTs: args.end_ts,
        fidelity: args.fidelity,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_token_info',
    description: 'Resolve a CLOB token id to its market and read trading constraints: minimum tick size, neg-risk flag, fee rate.',
    parameters: {
      token_id: str('CLOB token id', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const [tickSize, negRisk, marketInfo] = await Promise.all([
        service.clob.getTickSize(args.token_id),
        service.clob.getNegRisk(args.token_id),
        service.clob.getMarketByToken(args.token_id).catch(() => null),
      ])
      return { token_id: args.token_id, ...tickSize, ...negRisk, market: marketInfo }
    },
  }))

  // ── Data API ────────────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
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
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const page = await service.dataApi.positions({
        user: args.user,
        condition: args.condition,
        status: args.status as any,
        redeemable: args.redeemable,
        sortBy: args.sort_by as 'CURRENT_VALUE' | 'TOTAL_PNL' | 'REALIZED_PNL' | 'UNREALIZED_PNL' | undefined,
        sortDirection: args.sort_direction as 'ASC' | 'DESC' | undefined,
        sizeThreshold: args.size_threshold_min,
        limit: args.limit,
        cursor: args.cursor,
      })
      const rows = Array.isArray(page.data) ? page.data : []
      return { count: rows.length, positions: rows, pagination: page.pagination }
    },
  }))

  ctx.tools.register(defineTool({
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
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const page = await service.dataApi.trades({
        user: args.user,
        condition: args.condition,
        side: args.side as 'BUY' | 'SELL' | undefined,
        takerOnly: args.taker_only,
        limit: args.limit,
        cursor: args.cursor,
      })
      const rows = Array.isArray(page.data) ? page.data : []
      return { count: rows.length, trades: rows, pagination: page.pagination }
    },
  }))

  ctx.tools.register(defineTool({
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
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const page = await service.dataApi.activity({
        user: args.user,
        type: args.type !== undefined ? [args.type] : undefined,
        conditionId: args.condition,
        side: args.side as 'BUY' | 'SELL' | undefined,
        limit: args.limit,
        cursor: args.cursor,
      })
      return { activity: page.data ?? [], pagination: page.pagination }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_holders',
    description: 'Top holders for one or more markets (Data API v2; full 32-byte condition ids required, param `condition`).',
    parameters: {
      condition: str('Condition id (0x…)', true),
      limit: num('Holders per market (default 10, max 20)'),
      include_pnl: bool('Include entry price and PnL per holder'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.dataApi.holders({ condition: args.condition, limit: args.limit, includePnl: args.include_pnl })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_leaderboard',
    description: 'Trader leaderboard rankings by profit/volume for a time window (Data API v2). Cursor-based pagination.',
    parameters: {
      window: enumParam(['all', 'month', 'week', 'day'], 'Ranking window (default all)'),
      limit: num('Number of traders (default 25)'),
      cursor: str('Opaque cursor from a previous response'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.dataApi.leaderboard({
        timePeriod: args.window as 'DAY' | 'WEEK' | 'MONTH' | 'ALL' | undefined,
        limit: args.limit,
        cursor: args.cursor,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_open_interest',
    description: 'Open interest (Data API v2): globally, for one market (condition id), by event slug, or by event id.',
    parameters: {
      global: bool('Return global open interest'),
      condition: str('Condition id (0x…)'),
      slug: str('Market/event slug'),
      event_id: str('Numeric event id'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.dataApi.openInterest({
        global: args.global,
        condition: args.condition,
        slug: args.slug,
        eventId: args.event_id,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_live_volume',
    description: 'Live in-game trading volume for an event (sports/live markets), total plus per-market breakdown.',
    parameters: {
      event_id: str('Numeric event id', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.dataApi.liveVolume(args.event_id)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_portfolio_value',
    description: 'Total USD value of a wallet\'s Polymarket positions (Data API v2 /v2/value).',
    parameters: {
      user: str('Wallet/proxy address (0x…)', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return { value: await service.dataApi.value(args.user) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_user_stats',
    description: 'User stats from Data API v2: distinct markets traded, biggest win, join date and the full all-time PnL breakdown (realized/unrealized, fees, rebates).',
    parameters: {
      user: str('Wallet/proxy address (0x…)', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return { stats: await service.dataApi.userStats(args.user) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_resolutions',
    description: 'Resolution rows for one or more markets (Data API v2): status (inactive/active/resolved), payout vector in 6-decimal base units, resolution source. Only trust payouts from rows with status "resolved".',
    parameters: {
      condition_ids: strArray('Condition ids (0x…)'),
      limit: num('Page size'),
      cursor: str('Opaque cursor from a previous response'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const ids = args.condition_ids ?? []
      if (ids.length === 0) throw new Error('Provide at least one condition id')
      return await service.dataApi.resolutions({ conditionIds: ids, limit: args.limit, cursor: args.cursor })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_approvals',
    description: 'Token approval state of a wallet across the Polymarket contracts (Data API v2): pUSD allowances, exchange operators, per-approval amounts.',
    parameters: {
      user: str('Wallet/proxy address (0x…)', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return { approvals: await service.dataApi.approvals(args.user) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_geoblock_check',
    description: 'Check whether requests from this machine are geoblocked by Polymarket (returns blocked flag, country and region).',
    parameters: {},
    output: jsonOutput,
    async execute(_args, exec): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.geoblock(exec.signal)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_combo_markets',
    description: 'List combinatorial ("combo") RFQ markets — multi-outcome combination markets traded through the RFQ API.',
    parameters: {
      limit: num('Page size'),
      cursor: str('Cursor from a previous response'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.rfq.comboMarkets({ limit: args.limit, cursor: args.cursor })
    },
  }))

  // ── Knowledge lookup ────────────────────────────────────────────────────

  ctx.tools.register(defineTool({
    name: 'polymarket_knowledge',
    description: 'Read the bundled Polymarket knowhow: authentication flows, order patterns, WebSocket channels, fees, CTF operations, bridge, gasless transactions, error codes, rate limits, geoblock rules, Perps and RFQ APIs. Load a topic or search across topics.',
    parameters: {
      topic: enumParam(KNOWLEDGE_TOPICS, 'Knowledge module to read'),
      query: str('Search term; returns matching excerpts across modules instead of loading one'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if (args.query !== undefined && args.query.length > 0) {
        return { matches: await searchKnowledgeModules(args.query) }
      }
      if (args.topic === undefined) {
        return { topics: KNOWLEDGE_TOPICS, hint: 'Pass a topic to load it, or query= to search across topics.' }
      }
      return { topic: args.topic, content: await loadKnowledgeModule(args.topic) }
    },
  }))

  // ── Opt-in: account & trading ───────────────────────────────────────────

  // Trading tools require BOTH the explicit opt-in AND fully resolved L2
  // credentials — registering them without credentials would only surface
  // runtime failures to the model (documented contract in README/CLAUDE.md).
  if (config.trading.enabled === true && service.tradingCredentials !== undefined) {
    registerTradingTools(ctx, service)
  } else if (config.trading.enabled === true) {
    ctx.logger?.warn?.('polymarket-tools: trading.enabled but L2 credentials incomplete; account/trading tools not registered')
  }
  if (config.perps.enabled === true && service.perpsCredentials !== undefined) {
    registerPerpsTools(ctx, service)
  } else if (config.perps.enabled === true) {
    ctx.logger?.warn?.('polymarket-tools: perps.enabled but proxy/secret credentials incomplete; perps tools not registered')
  }
}

function registerTradingTools(ctx: Context, service: PolymarketService): void {
  ctx.tools.register(defineTool({
    name: 'polymarket_account_orders',
    description: 'Your open/history orders on the CLOB (L2 authenticated). Filter by market condition id, asset id, or fetch one order by id.',
    parameters: {
      order_id: str('Fetch a single order by its id'),
      market: str('Filter by market condition id (0x…)'),
      asset_id: str('Filter by CLOB token id'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      if (args.order_id !== undefined) return await service.clob.getOrder(args.order_id)
      return await service.clob.getOrders({ market: args.market, assetId: args.asset_id })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_account_trades',
    description: 'Your executed trades on the CLOB (L2 authenticated), filterable by market or asset.',
    parameters: {
      market: str('Filter by market condition id (0x…)'),
      asset_id: str('Filter by CLOB token id'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.clob.getTrades({ market: args.market, assetId: args.asset_id })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_cancel_orders',
    description: 'Cancel your orders: one (mode=single), several (mode=batch + order_ids), everything (mode=all), or all orders of a market (mode=market). Irreversible.',
    parameters: {
      mode: enumParam(['single', 'batch', 'all', 'market'], 'Cancellation mode', true),
      order_id: str('single mode: order id to cancel'),
      order_ids: strArray('batch mode: order ids to cancel'),
      market_condition_id: str('market mode: condition id whose orders to cancel'),
      asset_id: str('market mode: optionally restrict to one token id'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      switch (args.mode) {
        case 'single':
          if (args.order_id === undefined) throw new Error('single mode requires order_id')
          return { canceled: await service.clob.cancelOrder(args.order_id) }
        case 'batch': {
          const ids = args.order_ids ?? []
          if (ids.length === 0) throw new Error('batch mode requires order_ids')
          return { canceled: await service.clob.cancelOrders(ids) }
        }
        case 'all':
          return { canceled: await service.clob.cancelAllOrders() }
        case 'market':
          if (args.market_condition_id === undefined || args.asset_id === undefined) throw new Error('market mode requires both market_condition_id and asset_id')
          return { canceled: await service.clob.cancelMarketOrders(args.market_condition_id, args.asset_id) }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_balance_allowance',
    description: 'Collateral or conditional-token balance and exchange allowance for your funder address (L2 authenticated). Protocol V2 positions use asset_type CONDITIONAL-V2, legacy CTF positions CONDITIONAL, pUSD COLLATERAL.',
    parameters: {
      asset_type: enumParam(['COLLATERAL', 'CONDITIONAL', 'CONDITIONAL-V2'], 'Balance kind', true),
      token_id: str('CONDITIONAL/CONDITIONAL-V2: the token/position id to inspect'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.clob.getBalanceAllowance(
        args.asset_type as 'COLLATERAL' | 'CONDITIONAL' | 'CONDITIONAL-V2',
        args.token_id,
      )
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_heartbeat',
    description: 'Send a trading heartbeat. While using heartbeats you must re-send at least every ~5 seconds; a >10s lapse cancels ALL your open orders. Pass back the returned heartbeat_id next time (first call: empty).',
    parameters: {
      heartbeat_id: str('Previous heartbeat_id (empty string on first call)'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      return await service.clob.sendHeartbeat(args.heartbeat_id ?? '')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_api_keys',
    description: 'List the L2 API keys registered on your Polymarket account, and whether the account is restricted to close-only mode.',
    parameters: {},
    output: jsonOutput,
    async execute(): Promise<any> { // canonical value is runtime-validated against the output schema
      const keys = await service.clob.getApiKeys()
      const ban = await service.clob.getBanStatus().catch(() => null)
      return { keys, ban_status: ban }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_place_order',
    description: 'Place an order (GTC/GTD limit or FOK/FAK marketable) through the official unified SDK @polymarket/client. Works for V1/CTF token ids AND Protocol V2 position ids via the same asset id; tick size, neg-risk and fees resolve automatically. FOK/FAK BUY takes amount=USD to spend; FOK/FAK SELL takes size=shares with price acting as the worst-price floor (minPrice). Requires SDK + private key configuration.',
    parameters: {
      token_id: str('Asset id to trade: CTF token id (V1) or Protocol V2 position id', true),
      side: enumParam(['BUY', 'SELL'], 'Order side', true),
      price: num('Limit price within tick size bounds. Required for GTC/GTD; on FOK/FAK SELL it is the worst-price floor (minPrice); ignored on FOK/FAK BUY'),
      size: num('Shares (limit orders; FOK/FAK SELL)'),
      amount: num('Dollars to spend (FOK/FAK BUY)'),
      order_type: enumParam(['GTC', 'GTD', 'FOK', 'FAK'], 'Order type (default GTC)'),
      expiration: num('GTD only: UTC-seconds expiration; must be ≥3 minutes ahead'),
      post_only: bool('GTC/GTD only: reject instead of crossing the spread'),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const creds = service.tradingCredentials
      if (creds === undefined) throw new Error('Trading credentials are not configured')
      const orderType = (args.order_type ?? 'GTC') as 'GTC' | 'GTD' | 'FOK' | 'FAK'
      // Per-branch validation: limit orders need a price; FOK/FAK BUY ignores it.
      if ((orderType === 'GTC' || orderType === 'GTD') && args.price === undefined) {
        throw new Error('price is required for GTC/GTD limit orders')
      }
      const privateKey = process.env.POLY_PRIVATE_KEY ?? ''
      if (privateKey === '') {
        throw new Error('Set POLY_PRIVATE_KEY (or extend signing.ts wiring) so the unified SDK can sign orders')
      }
      return await sdkPlaceOrder(
        {
          privateKey,
          walletAddress: creds.address,
          creds: { apiKey: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase },
        },
        {
          assetId: args.token_id,
          side: args.side as 'BUY' | 'SELL',
          price: args.price,
          size: args.size,
          amount: args.amount,
          orderType,
          expiration: args.expiration,
          postOnly: args.post_only,
        },
      )
    },
  }))
}

function registerPerpsTools(ctx: Context, service: PolymarketService): void {
  ctx.tools.register(defineTool({
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
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
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
          return { klines: await p.klines({ instrument_id: args.instrument_id, interval: args.interval as any, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
        case 'trades':
          if (args.instrument_id === undefined) throw new Error('trades requires instrument_id')
          return { trades: await p.recentTrades({ instrument_id: args.instrument_id, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
        case 'mark-history':
          if (args.instrument_id === undefined || args.interval === undefined || args.start_timestamp === undefined) throw new Error('mark-history requires instrument_id, interval and start_timestamp')
          return { mark_history: await p.markPriceHistory({ instrument_id: args.instrument_id, interval: args.interval as any, start_timestamp: args.start_timestamp, end_timestamp: args.end_timestamp }) }
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
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'polymarket_perps_account',
    description: 'Polymarket Perps authenticated account view (read-only): balances, portfolio, fills, open orders, order history, PnL, funding payments, deposits, withdrawals, limits, rewards, stats.',
    parameters: {
      endpoint: enumParam(['balances', 'portfolio', 'fills', 'open-orders', 'orders', 'pnl', 'funding', 'deposits', 'withdrawals', 'limits', 'rewards', 'stats'], 'Account endpoint', true),
    },
    output: jsonOutput,
    async execute(args): Promise<any> { // canonical value is runtime-validated against the output schema
      const p = service.perps
      switch (args.endpoint) {
        case 'balances': return { balances: await p.balances() }
        case 'portfolio': return { portfolio: await p.accountPortfolio() }
        case 'fills': return { fills: await p.fills() }
        case 'open-orders': return { open_orders: await p.openOrders() }
        case 'orders': return { orders: await p.ordersHistory() }
        case 'pnl': return { pnl: await p.pnl() }
        case 'funding': return { funding: await p.fundingPayments() }
        case 'deposits': return { deposits: await p.deposits() }
        case 'withdrawals': return { withdrawals: await p.withdrawals() }
        case 'limits': return { limits: await p.limits() }
        case 'rewards': return { rewards: await p.rewards() }
        case 'stats': return { stats: await p.stats() }
      }
    },
  }))
}

// ── Plugin entry point ─────────────────────────────────────────────────────

export const name = 'polymarket-tools'
export const inject = ['polymarket', 'tools']

export { Config }

export function apply(ctx: Context, config: Config): void {
  registerTools(ctx, ctx.polymarket, config)
}
