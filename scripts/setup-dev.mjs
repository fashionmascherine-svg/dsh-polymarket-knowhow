#!/usr/bin/env node
/**
 * Link dev-time dependencies from a DeepSeek Harness source checkout so this
 * plugin can typecheck/build/test without publishing cycles.
 *
 * Usage: node scripts/setup-dev.mjs [/path/to/deepseek-harness]
 * Default checkout location: sibling directory `../deepseek-harness`.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const harnessRoot = resolve(process.argv[2] ?? new URL('../../deepseek-harness', import.meta.url).pathname)
const nm = join(import.meta.dirname ?? 'scripts', '..', 'node_modules')

if (!existsSync(harnessRoot)) {
  console.error(`deepseek-harness checkout not found at ${harnessRoot}`)
  console.error('Pass the path explicitly: node scripts/setup-dev.mjs /path/to/deepseek-harness')
  process.exit(1)
}

/** Package name → path inside the harness checkout. */
const LINKS = {
  '@deepseek-ai/cordis': 'vendor/cordis',
  '@deepseek-ai/schemastery': 'vendor/schemastery',
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
  '@deepseek-ai/dsh-skill': 'packages/skill/skill',
  typescript: 'node_modules/typescript',
}

function forceLink(target, linkPath) {
  if (!existsSync(target)) throw new Error(`missing link target ${target}`)
  try { rmSync(linkPath) } catch { /* absent */ }
  mkdirSync(join(linkPath, '..'), { recursive: true })
  symlinkSync(target, linkPath, 'dir')
  console.log(`${linkPath} -> ${target}`)
}

// @types/node rides along with the checkout's node_modules if present.
const typesNode = join(harnessRoot, 'node_modules', '@types', 'node')
if (existsSync(typesNode)) LINKS['@types/node'] = 'node_modules/@types/node'

mkdirSync(nm, { recursive: true })
for (const [name, rel] of Object.entries(LINKS)) {
  const scope = name.startsWith('@') ? name.slice(0, name.indexOf('/')) : undefined
  const target = resolve(harnessRoot, rel)
  const linkPath = scope !== undefined ? join(nm, scope, name.slice(scope.length + 1)) : join(nm, name)
  forceLink(target, linkPath)
}
console.log('dev links ready')
