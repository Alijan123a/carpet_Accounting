import { describe, it, expect } from 'vitest'
import { createHmac, randomBytes } from 'crypto'
import {
  base32Encode,
  signPayload,
  normalizeKey,
  validateKey,
  computeFingerprint,
  cleanValue,
  PAYLOAD_CHARS,
  SIG_CHARS,
  B32
} from '../licenseCrypto'

const SECRET = 'unit-test-secret-do-not-ship'

/** Mint a valid key for a given secret — mirrors tools/generate-license-key.mjs. */
function mintKey(secret: string): string {
  const payload = base32Encode(randomBytes(10)).slice(0, PAYLOAD_CHARS)
  const sig = base32Encode(createHmac('sha256', secret).update(payload).digest()).slice(0, SIG_CHARS)
  const raw = payload + sig
  return raw.match(/.{1,5}/g)!.join('-')
}

describe('normalizeKey', () => {
  it('uppercases and strips separators/whitespace', () => {
    expect(normalizeKey('abc12-def34')).toBe('ABC12DEF34')
    expect(normalizeKey('  a b-c_d  ')).toBe('ABCD')
  })
})

describe('validateKey', () => {
  it('accepts a freshly minted key (with and without dashes)', () => {
    const key = mintKey(SECRET)
    expect(validateKey(key, SECRET)).toBe(true)
    expect(validateKey(normalizeKey(key), SECRET)).toBe(true)
  })

  it('rejects a key signed with a different secret', () => {
    const key = mintKey('some-other-secret')
    expect(validateKey(key, SECRET)).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const key = normalizeKey(mintKey(SECRET))
    const tampered =
      key.slice(0, PAYLOAD_CHARS) + (key[PAYLOAD_CHARS] === 'A' ? 'B' : 'A') + key.slice(PAYLOAD_CHARS + 1)
    expect(validateKey(tampered, SECRET)).toBe(false)
  })

  it('rejects wrong-length and empty input', () => {
    expect(validateKey('', SECRET)).toBe(false)
    expect(validateKey('TOO-SHORT', SECRET)).toBe(false)
    expect(validateKey('A'.repeat(40), SECRET)).toBe(false)
  })

  it('signPayload only uses the allowed base32 alphabet', () => {
    const sig = signPayload('ABCDE12345', SECRET)
    expect(sig).toHaveLength(SIG_CHARS)
    for (const ch of sig) expect(B32).toContain(ch)
  })
})

describe('computeFingerprint', () => {
  const full = {
    cpuManufacturer: 'AMD',
    cpuBrand: 'Ryzen 3 3250U with Radeon Graphics',
    baseboardSerial: 'PF3NW56D',
    biosSerial: 'PF3NW56D'
  }

  it('is deterministic and a 64-char sha-256 hex', () => {
    const a = computeFingerprint(full)
    const b = computeFingerprint({ ...full })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when a hardware value changes', () => {
    const other = computeFingerprint({ ...full, baseboardSerial: 'DIFFERENT123' })
    expect(other).not.toBe(computeFingerprint(full))
  })

  it('ignores junk placeholder serials (falls back to available values)', () => {
    // Motherboard + BIOS report the classic "Default string" junk → they must be
    // dropped, so the fingerprint equals one computed from CPU only.
    const withJunk = computeFingerprint({
      cpuManufacturer: 'AMD',
      cpuBrand: 'Ryzen 3 3250U with Radeon Graphics',
      baseboardSerial: 'Default string',
      biosSerial: 'To be filled by O.E.M.'
    })
    const cpuOnly = computeFingerprint({
      cpuManufacturer: 'AMD',
      cpuBrand: 'Ryzen 3 3250U with Radeon Graphics'
    })
    expect(withJunk).toBe(cpuOnly)
  })

  it('never throws and returns the sentinel hash when nothing is usable', () => {
    const empty = computeFingerprint({})
    const allJunk = computeFingerprint({ baseboardSerial: 'None', biosSerial: 'N/A' })
    expect(empty).toMatch(/^[0-9a-f]{64}$/)
    expect(allJunk).toBe(empty)
  })
})

describe('cleanValue', () => {
  it('trims and blanks known junk, case-insensitively', () => {
    expect(cleanValue('  PF3NW56D  ')).toBe('PF3NW56D')
    expect(cleanValue('DEFAULT STRING')).toBe('')
    expect(cleanValue(null)).toBe('')
    expect(cleanValue(undefined)).toBe('')
  })
})
