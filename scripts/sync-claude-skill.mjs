#!/usr/bin/env node
/**
 * Sync knowledge/*.md into skills/polymarket/references/ so the Claude Code
 * plugin ships self-contained docs without forking the source of truth:
 * knowledge/ stays canonical; references/ are generated views.
 *
 * Usage: npm run sync:claude-skill   (or node scripts/sync-claude-skill.mjs)
 */
import { readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const KNOWLEDGE_DIR = join(ROOT, 'knowledge')
export const REFERENCES_DIR = join(ROOT, 'skills', 'polymarket', 'references')

/** Files copied into references/ (SKILL.md itself is hand-authored). */
export function listKnowledgeModules(dir = KNOWLEDGE_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'SKILL.md')
    .sort()
}

/** Generated-view transform applied to each knowledge module. */
export function transform(name, content) {
  const header =
    '<!-- GENERATED from knowledge/' + name + ' by scripts/sync-claude-skill.mjs.\n' +
    '     Do not edit: change knowledge/' + name + ' and run npm run sync:claude-skill. -->\n\n'
  return header + content
}

/** What references/<name> should contain given current knowledge/<name>. */
export function expectedContent(name) {
  return transform(name, readFileSync(join(KNOWLEDGE_DIR, name), 'utf8'))
}

function main() {
  const names = listKnowledgeModules()
  rmSync(REFERENCES_DIR, { recursive: true, force: true })
  mkdirSync(REFERENCES_DIR, { recursive: true })
  for (const name of names) {
    writeFileSync(join(REFERENCES_DIR, name), expectedContent(name))
  }
  console.log('synced ' + names.length + ' modules -> skills/polymarket/references/')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}