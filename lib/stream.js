import { Config } from './config.js';
export const name = 'polymarket-stream';
export const inject = [];
export { Config };
export function apply(ctx, config) {
    if (config.stream.enabled !== true)
        return;
    const logger = ctx.logger;
    let socket;
    let pingTimer;
    let reconnectTimer;
    let reconnectAttempt = 0;
    let disposed = false;
    function clearTimers() {
        if (pingTimer !== undefined) {
            clearInterval(pingTimer);
            pingTimer = undefined;
        }
        if (reconnectTimer !== undefined) {
            clearTimeout(reconnectTimer);
            reconnectTimer = undefined;
        }
    }
    function connect() {
        if (disposed)
            return;
        try {
            socket = new WebSocket(config.wsMarketUrl);
        }
        catch (error) {
            logger.warn('polymarket-stream: websocket construction failed: %s', error);
            scheduleReconnect();
            return;
        }
        socket.onopen = () => {
            reconnectAttempt = 0;
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'market', assets_ids: config.stream.assetIds }));
                pingTimer = setInterval(() => {
                    try {
                        socket?.send('PING');
                    }
                    catch { /* closing */ }
                }, config.stream.pingIntervalMs);
                logger.info('polymarket-stream: subscribed to %d asset(s)', config.stream.assetIds.length);
            }
        };
        socket.onmessage = (event) => {
            const raw = typeof event.data === 'string' ? event.data : '';
            if (raw === 'PONG' || raw.length === 0)
                return;
            try {
                const parsed = JSON.parse(raw);
                for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
                    if (item !== null && typeof item === 'object') {
                        ctx.emit('polymarket/market-event', {
                            channel: 'market',
                            ...item,
                            payload: item,
                        });
                    }
                }
            }
            catch {
                logger.debug?.('polymarket-stream: non-JSON frame dropped');
            }
        };
        socket.onclose = () => {
            clearTimers();
            if (!disposed && config.stream.reconnectDelayMs > 0)
                scheduleReconnect();
        };
        socket.onerror = () => { };
    }
    /** Reconnect with capped exponential backoff (+jitter); reset on open. */
    function scheduleReconnect() {
        const base = Math.max(config.stream.reconnectDelayMs, 250);
        const delay = Math.round(Math.min(base * 2 ** reconnectAttempt, 30_000) * (0.75 + Math.random() * 0.5));
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => connect(), delay);
    }
    ctx.effect(() => {
        if (config.stream.assetIds.length === 0) {
            logger.warn('polymarket-stream: enabled but stream.assetIds is empty; nothing subscribed');
        }
        connect();
        return () => {
            disposed = true;
            clearTimers();
            try {
                socket?.close();
            }
            catch { /* already closed */ }
        };
    }, 'polymarket market-channel websocket');
}
