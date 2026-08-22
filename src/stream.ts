/**
 * Optional market-channel WebSocket bridge (`wss://ws-subscriptions-clob…`).
 *
 * Off by default; enable with `stream.enabled` plus `stream.assetIds`.
 * Maintains one subscription, keeps it alive with 10s PING frames (the server
 * expects traffic at least every ~10s), reconnects with a fixed delay after
 * abnormal closes, and re-emits every parsed event on the Cordis event
 * `polymarket/market-event`. All resources belong to the plugin fiber.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.js'

export interface PolymarketMarketEvent {
  channel: 'market'
  event_type?: string
  asset_id?: string
  market?: string
  payload: Record<string, unknown>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** One parsed market-channel event (book / price_change / last_trade_price / …). */
    'polymarket/market-event'(payload: PolymarketMarketEvent): void
  }
}

export const name = 'polymarket-stream'
export const inject: string[] = []

export { Config }

export function apply(ctx: Context, config: Config): void {
  if (config.stream.enabled !== true) return

  const logger = ctx.logger
  let socket: WebSocket | undefined
  let pingTimer: NodeJS.Timeout | undefined
  let reconnectTimer: NodeJS.Timeout | undefined
  let reconnectAttempt = 0
  let disposed = false

  function clearTimers(): void {
    if (pingTimer !== undefined) { clearInterval(pingTimer); pingTimer = undefined }
    if (reconnectTimer !== undefined) { clearTimeout(reconnectTimer); reconnectTimer = undefined }
  }

  function connect(): void {
    if (disposed) return
    try {
      socket = new WebSocket(config.wsMarketUrl)
    } catch (error) {
      logger.warn('polymarket-stream: websocket construction failed: %s', error)
      scheduleReconnect()
      return
    }
    socket.onopen = () => {
      reconnectAttempt = 0
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'market', assets_ids: config.stream.assetIds }))
        pingTimer = setInterval(() => {
          try { socket?.send('PING') } catch { /* closing */ }
        }, config.stream.pingIntervalMs)
        logger.info('polymarket-stream: subscribed to %d asset(s)', config.stream.assetIds.length)
      }
    }
    socket.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      if (raw === 'PONG' || raw.length === 0) return
      try {
        const parsed: unknown = JSON.parse(raw)
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          if (item !== null && typeof item === 'object') {
            ctx.emit('polymarket/market-event', {
              channel: 'market',
              ...(item as Record<string, unknown>),
              payload: item as Record<string, unknown>,
            })
          }
        }
      } catch {
        logger.debug?.('polymarket-stream: non-JSON frame dropped')
      }
    }
    socket.onclose = () => {
      clearTimers()
      if (!disposed && config.stream.reconnectDelayMs > 0) scheduleReconnect()
    }
    socket.onerror = () => { /* close handler owns recovery */ }
  }

  /** Reconnect with capped exponential backoff (+jitter); reset on open. */
  function scheduleReconnect(): void {
    const base = Math.max(config.stream.reconnectDelayMs, 250)
    const delay = Math.round(Math.min(base * 2 ** reconnectAttempt, 30_000) * (0.75 + Math.random() * 0.5))
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => connect(), delay)
  }

  ctx.effect(() => {
    if (config.stream.assetIds.length === 0) {
      logger.warn('polymarket-stream: enabled but stream.assetIds is empty; nothing subscribed')
    }
    connect()
    return () => {
      disposed = true
      clearTimers()
      try { socket?.close() } catch { /* already closed */ }
    }
  }, 'polymarket market-channel websocket')
}
