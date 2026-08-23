/**
 * Registers the embedded `polymarket` runtime skill on ctx.skills.
 *
 * The skill body ships as `knowledge/SKILL.md`; the other knowledge modules
 * are exposed as directory resources beside it, so the loaded skill can point
 * the model at exactly the deep-dive file it needs (or use the
 * `polymarket_knowledge` tool for direct lookup).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Config } from './config.js';
import { knowledgeDir } from './knowledge.js';
export const name = 'polymarket-skills';
export const inject = ['skills'];
export { Config };
const SKILL_NAME = 'polymarket';
const SKILL_DESCRIPTION = 'Deep Polymarket API knowhow: L1/L2 authentication, order placement (GTC/GTD/FOK/FAK, batch, heartbeat), '
    + 'market data (Gamma, Data API, CLOB orderbook), WebSocket channels, CTF operations, negative risk, bridge, '
    + 'gasless relayer, fees, error codes, rate limits, geoblock, plus the new Perps and Combos/RFQ APIs. '
    + 'Pair with the polymarket_* tools for live data.';
const SKILL_WHEN_TO_USE = 'Use when the user asks about Polymarket APIs, prediction-market trading, order signing, market discovery, '
    + 'positions/PnL, WebSocket streaming, CTF split/merge/redeem, bridge deposits, or when a polymarket_* tool '
    + 'returns an error the knowhow can explain.';
export function apply(ctx, config) {
    if (config.skills === false)
        return;
    let body;
    try {
        // Read at apply time so HMR/config changes re-read the shipped file.
        body = readFileSync(fileURLToPath(new URL('../knowledge/SKILL.md', import.meta.url)), 'utf8');
    }
    catch (error) {
        ctx.logger.warn('polymarket-skills: bundled SKILL.md unreadable, skill not registered: %s', error);
        return;
    }
    const registration = {
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        whenToUse: SKILL_WHEN_TO_USE,
        source: 'runtime',
        content: body,
        resourceBase: { kind: 'directory', path: knowledgeDir },
    };
    ctx.skills.register(registration);
    ctx.logger.info('polymarket-skills: registered runtime skill "%s"', SKILL_NAME);
}
