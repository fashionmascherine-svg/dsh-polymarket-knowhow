/**
 * Access to the bundled Polymarket knowhow modules (markdown) shipped in the
 * package's `knowledge/` directory. Powers the `polymarket_knowledge` tool and
 * the embedded runtime skill's resource hints.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
/** Directory containing the bundled knowledge modules. */
export const knowledgeDir = fileURLToPath(new URL('../knowledge/', import.meta.url));
/** Topic keys (file basenames without .md) available to tools and skills. */
export const KNOWLEDGE_TOPICS = [
    'api-endpoints', 'authentication', 'bridge', 'combos-rfq', 'concepts',
    'ctf-operations', 'error-codes', 'fees', 'gasless', 'geoblock',
    'market-data', 'order-patterns', 'perps', 'rate-limits', 'websocket',
];
export async function listKnowledgeModules() {
    const files = await readdir(knowledgeDir);
    return files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
}
/** Load one knowledge module verbatim. */
export async function loadKnowledgeModule(topic) {
    const safe = topic.replace(/[^a-z0-9-]/gi, '');
    return await readFile(`${knowledgeDir}${safe}.md`, 'utf8');
}
/** Case-insensitive search across all modules; returns line-matched excerpts. */
export async function searchKnowledgeModules(query) {
    const needle = query.toLowerCase();
    const matches = [];
    const topics = await listKnowledgeModules();
    for (const topic of topics) {
        if (matches.length >= 40)
            break;
        const content = await loadKnowledgeModule(topic);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(needle)) {
                matches.push({ topic, line: i + 1, text: lines[i].slice(0, 300) });
                if (matches.length >= 40)
                    break;
            }
        }
    }
    return matches;
}
