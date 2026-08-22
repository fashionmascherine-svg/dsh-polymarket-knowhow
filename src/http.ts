/**
 * Shared HTTP layer for the Polymarket API clients.
 *
 * Design notes:
 * - Uses Node's global `fetch` (Node >= 22, matching DSH's engines range).
 * - Every request is bounded by a timeout and the caller's abort signal.
 * - Transient failures (network, 429, 5xx) are retried with exponential
 *   backoff, honoring `Retry-After` when present.
 * - Non-2xx responses surface as {@link PolymarketHttpError} carrying the
 *   status and response body so tools can render precise diagnostics.
 * - Polymarket's geoblock (HTTP 403 with a `blocked` body) is surfaced as a
 *   dedicated error type because it is an environment problem, not a bug.
 */

/** Error thrown for any non-2xx API response after retries are exhausted. */
export class PolymarketHttpError extends Error {
  readonly status: number
  readonly url: string
  readonly method: string
  readonly body: string | undefined

  constructor(status: number, method: string, url: string, body: string | undefined) {
    let message = `Polymarket API ${method} ${url} failed with HTTP ${status}`
    const detail = extractErrorDetail(body)
    if (detail !== undefined) message += `: ${detail}`
    super(message)
    this.name = 'PolymarketHttpError'
    this.status = status
    this.method = method
    this.url = url
    this.body = body
  }
}

/** Error thrown when Polymarket blocks requests from this deployment's region. */
export class PolymarketGeoBlockedError extends Error {
  readonly status: number
  readonly country: string | undefined

  constructor(status: number, country: string | undefined, body: string | undefined) {
    super(
      `Polymarket is not available from this region${country === undefined ? '' : ` (${country})`}. `
      + 'Trading and market data may be restricted; see the geoblock knowledge module. '
      + (body === undefined ? '' : body.slice(0, 200)),
    )
    this.name = 'PolymarketGeoBlockedError'
    this.status = status
    this.country = country
  }
}

function extractErrorDetail(body: string | undefined): string | undefined {
  if (body === undefined || body.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      for (const key of ['error', 'message', 'detail', 'msg']) {
        const value = record[key]
        if (typeof value === 'string' && value.length > 0) return value
      }
    }
  } catch {
    // Not JSON; fall through to the truncated raw body.
  }
  return body.slice(0, 200)
}

export interface HttpConfig {
  timeoutMs: number
  maxRetries: number
  userAgent: string
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string
  query?: Record<string, string | number | boolean | string[] | undefined>
  signal?: AbortSignal
}

function appendQuery(url: string, query: RequestOptions['query']): string {
  if (query === undefined) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item))
    }
  }
  const encoded = search.toString()
  if (encoded.length === 0) return url
  return url + (url.includes('?') ? '&' : '?') + encoded
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }, { once: true })
  })
}

/**
 * Perform one JSON API request with timeout, retry and error mapping.
 * Returns the parsed JSON body. 204/205 and empty bodies resolve to `null`.
 */
export async function requestJson<T>(
  url: string,
  options: RequestOptions,
  config: HttpConfig,
): Promise<T> {
  const method = options.method ?? 'GET'
  const fullUrl = appendQuery(url, options.query)
  let lastError: unknown

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason instanceof Error ? options.signal.reason : new Error('aborted')
    if (attempt > 0) {
      const retryAfter = lastError instanceof RetryAfterHint ? lastError.delayMs : undefined
      const backoff = retryAfter ?? Math.min(1000 * 2 ** (attempt - 1), 8000)
      await sleep(backoff, options.signal)
    }
    try {
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
      const signal = options.signal === undefined ? timeoutSignal : AbortSignal.any([options.signal, timeoutSignal])
      const response = await fetch(fullUrl, {
        method,
        headers: {
          accept: 'application/json',
          'user-agent': config.userAgent,
          ...options.headers,
        },
        body: options.body,
        signal,
      })
      const text = await response.text()
      if (response.ok) {
        if (text.length === 0) return null as T
        try {
          return JSON.parse(text) as T
        } catch {
          throw new Error(`Polymarket API returned non-JSON content for ${method} ${url}`)
        }
      }
      // Geoblock: 403 from API hosts with a blocked payload, or the explicit
      // geoblock endpoint reporting blocked:true (rendered by the caller).
      if (response.status === 403) {
        const country = parseGeoCountry(text)
        if (country !== undefined || looksGeoBlocked(text)) {
          throw new PolymarketGeoBlockedError(response.status, country, text)
        }
      }
      const error = new PolymarketHttpError(response.status, method, fullUrl, text)
      if (RETRYABLE_STATUS.has(response.status) && attempt < config.maxRetries) {
        const retryAfterHeader = response.headers.get('retry-after')
        const retryAfterMs = retryAfterHeader === null ? undefined : Number(retryAfterHeader) * 1000
        lastError = new RetryAfterHint(Number.isFinite(retryAfterMs) ? retryAfterMs : undefined, error)
        continue
      }
      throw error
    } catch (error) {
      if (error instanceof PolymarketGeoBlockedError || error instanceof PolymarketHttpError) throw error
      lastError = error
      if (attempt >= config.maxRetries) {
        throw new Error(
          `Polymarket API request failed (${method} ${url}): ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('unreachable')
}

class RetryAfterHint extends Error {
  constructor(readonly delayMs: number | undefined, readonly cause: unknown) {
    super('retry-after hint')
  }
}

function parseGeoCountry(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed !== null && typeof parsed === 'object') {
      const country = (parsed as Record<string, unknown>)['country']
      if (typeof country === 'string') return country
    }
  } catch {
    // ignore
  }
  return undefined
}

function looksGeoBlocked(body: string): boolean {
  return /blocked|geoblock|not available in your (country|region)/i.test(body)
}

/** Encode an object as JSON request body with the matching content type. */
export function jsonBody(value: unknown): { body: string; headers: Record<string, string> } {
  return { body: JSON.stringify(value), headers: { 'content-type': 'application/json' } }
}
