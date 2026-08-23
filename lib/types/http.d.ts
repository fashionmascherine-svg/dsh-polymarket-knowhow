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
export declare class PolymarketHttpError extends Error {
    readonly status: number;
    readonly url: string;
    readonly method: string;
    readonly body: string | undefined;
    constructor(status: number, method: string, url: string, body: string | undefined);
}
/** Error thrown when Polymarket blocks requests from this deployment's region. */
export declare class PolymarketGeoBlockedError extends Error {
    readonly status: number;
    readonly country: string | undefined;
    constructor(status: number, country: string | undefined, body: string | undefined);
}
export interface HttpConfig {
    timeoutMs: number;
    maxRetries: number;
    userAgent: string;
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: string;
    query?: Record<string, string | number | boolean | string[] | undefined>;
    signal?: AbortSignal;
}
/**
 * Perform one JSON API request with timeout, retry and error mapping.
 * Returns the parsed JSON body. 204/205 and empty bodies resolve to `null`.
 */
export declare function requestJson<T>(url: string, options: RequestOptions, config: HttpConfig): Promise<T>;
/** Encode an object as JSON request body with the matching content type. */
export declare function jsonBody(value: unknown): {
    body: string;
    headers: Record<string, string>;
};
