/**
 * Claude Code packaging contract: manifests parse, point at real files, and
 * the generated skill references are in sync with knowledge/.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const readJson = (p) => JSON.parse(readFileSync(root + p, 'utf8'))

test('.claude-plugin/plugin.json satisfies the Claude Code plugin contract', () => {
  const manifest = readJson('.claude-plugin/plugin.json')
  assert.match(manifest.name, /^[a-z0-9-]+$/)
  assert.ok(manifest.description.length > 20)
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.author.name, 'fashionmascherine-svg')
})

test('.claude-plugin/marketplace.json lists this repo as a single-plugin marketplace', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  assert.equal(marketplace.owner.name, 'fashionmascherine-svg')
  assert.equal(marketplace.plugins.length, 1)
  const entry = marketplace.plugins[0]
  assert.equal(entry.source, './')
  assert.equal(entry.name, 'polymarket-knowhow')
  assert.equal(entry.version, readJson('.claude-plugin/plugin.json').version)
})

test('.mcp.json wires the bundled MCP server through CLAUDE_PLUGIN_ROOT', () => {
  const mcp = readJson('.mcp.json')
  const def = mcp.mcpServers['polymarket-knowhow']
  assert.ok(def, '.mcp.json must define the polymarket-knowhow server')
  assert.equal(def.command, 'node')
  assert.ok(def.args[0].includes('${CLAUDE_PLUGIN_ROOT}'))
  const scriptPath = def.args[0].replace('${CLAUDE_PLUGIN_ROOT}', root)
  assert.ok(existsSync(scriptPath), 'mcp server script must exist: ' + scriptPath)
})

test('skills/polymarket/SKILL.md carries valid frontmatter for auto-discovery', () => {
  const md = readFileSync(root + 'skills/polymarket/SKILL.md', 'utf8')
  assert.match(md, /^---\r?\nname: polymarket\r?\ndescription: .+\r?\n---/, 'frontmatter with name + description required')
  assert.ok(md.includes('references/'), 'SKILL.md should index the reference modules')
})

test('generated references are exactly in sync with knowledge/', async () => {
  const sync = await import('../../scripts/sync-claude-skill.mjs')
  for (const name of sync.listKnowledgeModules()) {
    const actualPath = sync.REFERENCES_DIR + '/' + name
    assert.ok(existsSync(actualPath), 'missing generated copy: references/' + name)
    assert.equal(readFileSync(actualPath, 'utf8'), sync.expectedContent(name), 'references/' + name + ' out of sync; run npm run sync:claude-skill')
  }
  // And nothing stale lingers in references/.
  const { readdirSync } = await import('node:fs')
  const expected = new Set(sync.listKnowledgeModules())
  for (const file of readdirSync(sync.REFERENCES_DIR)) {
    assert.ok(expected.has(file), 'stale generated file: references/' + file)
  }
})
