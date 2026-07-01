/**
 * Pure, dependency-free license crypto + fingerprint helpers.
 *
 * IMPORTANT: this module holds NO secret and imports NOTHING from Electron or
 * `systeminformation`, so it is safe to unit-test under plain Node and it never
 * drags the signing secret into any bundle. The HMAC secret is always passed in
 * as an argument by the main-process wrapper (see src/main/licenseManager.ts).
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto'

// Crockford-style base32 alphabet (no I, L, O, U — avoids ambiguity when typing).
export const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const PAYLOAD_CHARS = 16 // 10 random bytes → 16 base32 chars
export const SIG_CHARS = 8 // first 8 base32 chars of the HMAC digest
export const KEY_CHARS = PAYLOAD_CHARS + SIG_CHARS // 24 significant chars

/** Encode a buffer as (unpadded) Crockford base32. */
export function base32Encode(buf: Buffer): string {
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

/** The signature for a payload: first SIG_CHARS of base32(HMAC-SHA256(secret, payload)). */
export function signPayload(payload: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest()
  return base32Encode(mac).slice(0, SIG_CHARS)
}

/** Strip formatting and normalise to the canonical A–Z0–9 form. */
export function normalizeKey(key: string): string {
  return (key || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/**
 * Validate a license key's HMAC signature against the given secret. Pure and
 * offline — no filesystem, no device fingerprint. Returns true only for a
 * well-formed, correctly-signed key.
 */
export function validateKey(key: string, secret: string): boolean {
  const norm = normalizeKey(key)
  if (norm.length !== KEY_CHARS) return false
  const payload = norm.slice(0, PAYLOAD_CHARS)
  const providedSig = norm.slice(PAYLOAD_CHARS)
  const expectedSig = signPayload(payload, secret)
  const a = Buffer.from(providedSig, 'utf8')
  const b = Buffer.from(expectedSig, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

// --- hardware fingerprint ---------------------------------------------------

/**
 * Values some OEMs write when a field is unset. Treated as "empty" so they never
 * contribute to the fingerprint (otherwise two different PCs from the same
 * vendor could collide, or a real serial could be diluted by junk).
 */
export const JUNK_SERIALS = new Set([
  '',
  'default string',
  'to be filled by o.e.m.',
  'to be filled by oem',
  'none',
  'n/a',
  'na',
  'not applicable',
  'not specified',
  'not available',
  'system serial number',
  'base board serial number',
  'o.e.m.',
  'oem',
  'unknown',
  'default',
  '0',
  '00000000',
  '000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff'
])

/** Trim a hardware value and blank it out if it is a known junk placeholder. */
export function cleanValue(value: string | null | undefined): string {
  const s = (value ?? '').trim()
  return JUNK_SERIALS.has(s.toLowerCase()) ? '' : s
}

export interface FingerprintParts {
  cpuManufacturer?: string | null
  cpuBrand?: string | null
  baseboardSerial?: string | null
  biosSerial?: string | null
}

/**
 * Combine the available hardware identifiers into a single SHA-256 hash. Pure
 * and deterministic. Empty/junk fields are dropped so the fingerprint degrades
 * gracefully instead of throwing. If NOTHING usable is present we hash a fixed
 * sentinel — the app still runs, though on such a machine the device lock cannot
 * distinguish hardware.
 */
export function computeFingerprint(parts: FingerprintParts): string {
  const usable = [
    cleanValue(parts.cpuManufacturer),
    cleanValue(parts.cpuBrand),
    cleanValue(parts.baseboardSerial),
    cleanValue(parts.biosSerial)
  ].filter(Boolean)
  const material = usable.length > 0 ? usable.join('|') : 'NO-HARDWARE-ID'
  return createHash('sha256').update(material).digest('hex')
}
