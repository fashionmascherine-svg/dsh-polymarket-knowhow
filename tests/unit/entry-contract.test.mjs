// Entry-module contract regression test.
//
// Live-boot verification surfaced three failure modes that unit coverage must
// pin forever:
//   1. `export { Config }` re-exporting a TYPE-only import is erased by tsc →
//      the loader passes raw/undefined config to apply.
//   2. A default export wins loader unwrapExports → the default (e.g. the
//      service class) is instantiated directly, bypassing apply + validation.
//   3. inject lists missing a service the module touches →
//      "cannot get property X without inject" at boot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const libDir = fileURLToPath(new URL('../../lib/', import.meta.url))
// Windows-safe specifier: ESM dynamic import needs a file:// URL, a bare
// `C:\...` path fails with ERR_UNSUPPORTED_ESM_URL_SCHEME.
const libUrl = (name) => pathToFileURL(libDir + name).href

const ENTRY_MODULES = ['service', 'tools', 'skills', 'stream']

test('entry modules satisfy the loader contract', async () => {
  for (const name of ENTRY_MODULES) {
    const mod = await import(libUrl(`${name}.js`))
    const label = `lib/${name}.js`

    // 1. Config exported as a value with schemastery validate support.
    assert.equal(typeof mod.Config, 'function', `${label} must export Config as a value (type-only import erases it)`)
    assert.equal(typeof mod.Config?.['~standard']?.validate, 'function', `${label} Config must be a standard-schema (schemastery)`)

    // Schema defaults fill even for undefined input — this is what lets a row
    // without config still receive a complete object in apply.
    const resolved = mod.Config['~standard'].validate(undefined)
    assert.ok(resolved && resolved.value && typeof resolved.value === 'object', `${label} Config.validate(undefined) must fill defaults`)

    // 2. No default export (unwrapExports prefers .default over the namespace).
    assert.equal(mod.default, undefined, `${label} must NOT have a default export`)

    // 3. apply present, name/inject declared, inject covers every ctx service read.
    assert.equal(typeof mod.apply, 'function', `${label} must export apply`)
    assert.equal(typeof mod.name, 'string', `${label} must export name`)
    assert.ok(Array.isArray(mod.inject), `${label} must export inject array`)
  }

  // tools.ts reads both ctx.polymarket and ctx.tools.
  const tools = await import(libUrl('tools.js'))
  for (const required of ['polymarket', 'tools']) {
    assert.ok(tools.inject.includes(required), `tools inject must include ${required}`)
  }
  const skills = await import(libUrl('skills.js'))
  assert.ok(skills.inject.includes('skills'), 'skills inject must include skills')
})

test('cordis.patch.yml rows match shipped entry modules', () => {
  const patch = readFileSync(fileURLToPath(new URL('../../cordis.patch.yml', import.meta.url)), 'utf8')
  for (const name of ENTRY_MODULES) {
    assert.match(patch, new RegExp(`name:\\s*dsh-polymarket-knowhow/${name}\\b`), `patch row for /${name} missing`)
  }
})
