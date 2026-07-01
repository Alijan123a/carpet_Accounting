#!/usr/bin/env node
/**
 * License key generator — KEEP THIS ON YOUR MACHINE ONLY.
 *
 * This tool lives outside `src/`, so electron-vite never bundles it and
 * electron-builder never packages it into the installer / .exe (its `files`
 * glob only ships `out/**`). It reads the SAME secret the app uses to validate
 * keys, from the gitignored `license.secret.json`.
 *
 * Usage:
 *   node tools/generate-license-key.mjs           # generate 1 key
 *   node tools/generate-license-key.mjs 5         # generate 5 keys
 *
 * The signing algorithm here MUST stay in sync with validateKey() in
 * src/main/licenseManager.ts (same base32 alphabet, same payload/sig lengths).
 */
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const secretPath = join(here, '..', 'license.secret.json')

let SECRET
try {
  SECRET = JSON.parse(readFileSync(secretPath, 'utf8')).secret
} catch {
  console.error(
    'ERROR: could not read license.secret.json.\n' +
      'Copy license.secret.example.json to license.secret.json and set a real secret first.'
  )
  process.exit(1)
}
if (!SECRET || SECRET === 'REPLACE_ME_WITH_A_LONG_RANDOM_SECRET') {
  console.error('ERROR: the secret in license.secret.json is still the placeholder. Set a real secret first.')
  process.exit(1)
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PAYLOAD_CHARS = 16
const SIG_CHARS = 8

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function group(key) {
  // Format 24 chars as XXXXX-XXXXX-XXXXX-XXXXX-XXXX for readability.
  return key.match(/.{1,5}/g).join('-')
}

function generate() {
  const payload = base32Encode(randomBytes(10)).slice(0, PAYLOAD_CHARS)
  const sig = base32Encode(createHmac('sha256', SECRET).update(payload).digest()).slice(0, SIG_CHARS)
  return group(payload + sig)
}

const count = Math.max(1, parseInt(process.argv[2] ?? '1', 10) || 1)
for (let i = 0; i < count; i++) console.log(generate())
