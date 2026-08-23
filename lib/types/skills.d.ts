import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
export declare const name = "polymarket-skills";
export declare const inject: readonly ["skills"];
export { Config };
export declare function apply(ctx: Context, config: Config): void;
