import { describe, it, expect } from 'vitest'
import {
  base32Encode,
  normalizeKey,
  formatKey,
  signFingerprint,
  licenseKeyForFingerprint,
  validateKeyForFingerprint,
  computeFingerprint,
  cleanValue,
  KEY_CHARS,
  B32
} from '../licenseCrypto'
// The standalone generator tool must stay byte-for-byte in sync with this module,
// or keys it mints will not validate in the app. Cross-check both implementations.
import { licenseKeyForFingerprint as generatorKey } from '../../../../license-generator/keygen.mjs'

const SECRET = 'unit-test-secret-do-not-ship'

const FP_A = computeFingerprint({
  cpuManufacturer: 'AMD',
  cpuBrand: 'Ryzen 3 3250U with Radeon Graphics',
  baseboardSerial: 'PF3NW56D',
  biosSerial: 'PF3NW56D'
})
const FP_B = computeFingerprint({
  cpuManufacturer: 'Intel',
  cpuBrand: 'Core i7-9750H',
  baseboardSerial: 'ABC12345',
  biosSerial: 'ABC12345'
})

describe('normalizeKey / formatKey', () => {
  it('uppercases and strips separators/whitespace', () => {
    expect(normalizeKey('abc12-def34')).toBe('ABC12DEF34')
    expect(normalizeKey('  a b-c_d  ')).toBe('ABCD')
  })

  it('formats a raw key into dashed 5-char groups and round-trips', () => {
    const raw = signFingerprint(FP_A, SECRET)
    const formatted = formatKey(raw)
    expect(formatted).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{1,5})+$/)
    expect(normalizeKey(formatted)).toBe(raw)
  })
})

describe('fingerprint-bound license keys', () => {
  it('mints a KEY_CHARS-long base32 key deterministically', () => {
    const raw = signFingerprint(FP_A, SECRET)
    expect(raw).toHaveLength(KEY_CHARS)
    for (const ch of raw) expect(B32).toContain(ch)
    expect(signFingerprint(FP_A, SECRET)).toBe(raw) // deterministic
  })

  it('accepts the key issued for its own fingerprint (formatted or raw)', () => {
    const key = licenseKeyForFingerprint(FP_A, SECRET)
    expect(validateKeyForFingerprint(key, FP_A, SECRET)).toBe(true)
    expect(validateKeyForFingerprint(normalizeKey(key), FP_A, SECRET)).toBe(true)
  })

  it('rejects a key on a DIFFERENT device (single-device lock)', () => {
    const keyForA = licenseKeyForFingerprint(FP_A, SECRET)
    expect(validateKeyForFingerprint(keyForA, FP_B, SECRET)).toBe(false)
  })

  it('rejects a key signed with a different secret', () => {
    const keyOtherSecret = licenseKeyForFingerprint(FP_A, 'some-other-secret')
    expect(validateKeyForFingerprint(keyOtherSecret, FP_A, SECRET)).toBe(false)
  })

  it('rejects a tampered key and empty input', () => {
    const raw = signFingerprint(FP_A, SECRET)
    const tampered = (raw[0] === 'A' ? 'B' : 'A') + raw.slice(1)
    expect(validateKeyForFingerprint(tampered, FP_A, SECRET)).toBe(false)
    expect(validateKeyForFingerprint('', FP_A, SECRET)).toBe(false)
    expect(validateKeyForFingerprint('TOO-SHORT', FP_A, SECRET)).toBe(false)
  })

  it('the standalone generator tool produces an identical, valid key (no drift)', () => {
    for (const fp of [FP_A, FP_B]) {
      const fromTool = generatorKey(fp, SECRET)
      expect(fromTool).toBe(licenseKeyForFingerprint(fp, SECRET))
      expect(validateKeyForFingerprint(fromTool, fp, SECRET)).toBe(true)
    }
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
    expect(computeFingerprint(full)).toBe(computeFingerprint({ ...full }))
    expect(computeFingerprint(full)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when a hardware value changes', () => {
    expect(computeFingerprint({ ...full, baseboardSerial: 'DIFFERENT123' })).not.toBe(computeFingerprint(full))
  })

  it('ignores junk placeholder serials (falls back to available values)', () => {
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
    expect(empty).toMatch(/^[0-9a-f]{64}$/)
    expect(computeFingerprint({ baseboardSerial: 'None', biosSerial: 'N/A' })).toBe(empty)
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

describe('base32Encode', () => {
  it('emits only alphabet characters', () => {
    const out = base32Encode(Buffer.from([0, 1, 2, 3, 255, 128, 64]))
    for (const ch of out) expect(B32).toContain(ch)
  })
})
