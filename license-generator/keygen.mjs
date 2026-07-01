// License key generation — plain-Node mirror of src/shared/license/licenseCrypto.ts.
// KEEP IN SYNC with that file: same base32 alphabet, KEY_CHARS, and the
// "HMAC-SHA256(secret, fingerprint) → base32 → slice → group-by-5" recipe. The
// TypeScript unit tests pin the algorithm; if you change one, change both.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const KEY_CHARS = 25
const KEY_GROUP = 5

const here = dirname(fileURLToPath(import.meta.url))
// The signing secret lives at the project root, gitignored, shared with the app.
const SECRET_PATH = join(here, '..', 'license.secret.json')

/** Load the shared HMAC secret; throws a clear error if it is missing/placeholder. */
export function loadSecret() {
  let secret
  try {
    secret = JSON.parse(readFileSync(SECRET_PATH, 'utf8')).secret
  } catch {
    throw new Error(
      'Could not read license.secret.json at the project root.\n' +
        'Copy license.secret.example.json to license.secret.json and set a real secret first.'
    )
  }
  if (!secret || secret === 'REPLACE_ME_WITH_A_LONG_RANDOM_SECRET') {
    throw new Error('The secret in license.secret.json is still the placeholder. Set a real secret first.')
  }
  return secret
}

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

/** Normalise a fingerprint: trim + lowercase. Valid = 64 hex chars (SHA-256). */
export function normalizeFingerprint(fp) {
  return String(fp ?? '').trim().toLowerCase()
}

export function isValidFingerprint(fp) {
  return /^[0-9a-f]{64}$/.test(normalizeFingerprint(fp))
}

function formatKey(raw) {
  return raw.match(new RegExp(`.{1,${KEY_GROUP}}`, 'g'))?.join('-') ?? raw
}

/** The display-formatted license key for a fingerprint under the given secret. */
export function licenseKeyForFingerprint(fingerprint, secret) {
  const fp = normalizeFingerprint(fingerprint)
  const mac = createHmac('sha256', secret).update(fp).digest()
  return formatKey(base32Encode(mac).slice(0, KEY_CHARS))
}
