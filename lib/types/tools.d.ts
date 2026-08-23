/**
 * Model-facing Polymarket tools.
 *
 * Read-only market-data tools are always registered. Account/trading tools
 * register only when `trading.enabled` AND complete L2 credentials resolve;
 * Perps tools follow the same pattern under `perps.enabled`. Every tool
 * honors `exec.signal`, returns one canonical JSON value declared by its
 * output schema, and renders bounded model-facing text.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
import type { PolymarketService } from './service.js';
export declare function registerTools(ctx: Context, service: PolymarketService, config: Config): void;
export declare const name = "polymarket-tools";
export declare const inject: string[];
export { Config };
export declare function apply(ctx: Context, config: Config): void;
