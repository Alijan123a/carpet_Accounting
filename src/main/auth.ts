import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Password protection.
 *
 * Only a strong HASH of the password is stored — never the plaintext. We use
 * Node's built-in scrypt (a vetted, memory-hard KDF) so there is no native
 * dependency to compile. The salt + hash + parameters live in a small JSON file
 * in the per-user app-data folder, independent of the database (so restoring a
 * DB backup never changes the password).
 */
interface AuthRecord {
  v: 1
  salt: string
  hash: string
  N: number
  r: number
  p: number
  keylen: number
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }
const MIN_LENGTH = 4

let unlocked = false

function authPath(): string {
  return join(app.getPath('userData'), 'auth.json')
}

function deriveHashHex(password: string, saltHex: string, p: { N: number; r: number; p: number; keylen: number }): string {
  const salt = Buffer.from(saltHex, 'hex')
  const key = scryptSync(Buffer.from(password, 'utf8'), salt, p.keylen, {
    N: p.N,
    r: p.r,
    p: p.p,
    maxmem: 256 * 1024 * 1024
  })
  return key.toString('hex')
}

export function isPasswordSet(): boolean {
  return existsSync(authPath())
}

export function isUnlocked(): boolean {
  return unlocked
}

function readRecord(): AuthRecord | null {
  if (!isPasswordSet()) return null
  try {
    return JSON.parse(readFileSync(authPath(), 'utf8')) as AuthRecord
  } catch {
    return null
  }
}

function writeRecord(password: string): void {
  const salt = randomBytes(16).toString('hex')
  const hash = deriveHashHex(password, salt, SCRYPT)
  const rec: AuthRecord = { v: 1, salt, hash, N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen }
  writeFileSync(authPath(), JSON.stringify(rec), { encoding: 'utf8', mode: 0o600 })
}

/** Constant-time comparison of a candidate password against the stored hash. */
function matches(password: string): boolean {
  const rec = readRecord()
  if (!rec) return false
  const candidate = Buffer.from(deriveHashHex(password, rec.salt, rec), 'hex')
  const expected = Buffer.from(rec.hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function setupPassword(password: string): { ok: boolean; reason?: string } {
  if (isPasswordSet()) return { ok: false, reason: 'already_set' }
  if (!password || password.length < MIN_LENGTH) return { ok: false, reason: 'too_short' }
  writeRecord(password)
  unlocked = true
  return { ok: true }
}

export function verifyPassword(password: string): { ok: boolean } {
  const ok = matches(password)
  if (ok) unlocked = true
  return { ok }
}

export function changePassword(oldPassword: string, newPassword: string): { ok: boolean; reason?: string } {
  if (!isPasswordSet()) return { ok: false, reason: 'not_set' }
  if (!matches(oldPassword)) return { ok: false, reason: 'wrong_old' }
  if (!newPassword || newPassword.length < MIN_LENGTH) return { ok: false, reason: 'too_short' }
  writeRecord(newPassword)
  return { ok: true }
}

/** TEMPORARY: verify the scrypt hash/verify roundtrip without touching auth.json. */
export function probeAuthCrypto(): { good: boolean; bad: boolean } {
  const salt = randomBytes(16).toString('hex')
  const refHex = deriveHashHex('correct-horse', salt, SCRYPT)
  const ref = Buffer.from(refHex, 'hex')
  const goodBuf = Buffer.from(deriveHashHex('correct-horse', salt, SCRYPT), 'hex')
  const badBuf = Buffer.from(deriveHashHex('wrong-password', salt, SCRYPT), 'hex')
  return {
    good: goodBuf.length === ref.length && timingSafeEqual(goodBuf, ref),
    bad: badBuf.length === ref.length && timingSafeEqual(badBuf, ref)
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:status', () => ({ isSet: isPasswordSet(), unlocked: isUnlocked() }))
  ipcMain.handle('auth:setup', (_e, password: string) => setupPassword(password))
  ipcMain.handle('auth:verify', (_e, password: string) => verifyPassword(password))
  ipcMain.handle('auth:change', (_e, oldPassword: string, newPassword: string) => changePassword(oldPassword, newPassword))
}
