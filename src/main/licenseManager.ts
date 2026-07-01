import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import si from 'systeminformation'
import type { LicenseStatus } from '../shared/contracts'
import { computeFingerprint, normalizeKey, validateKeyForFingerprint } from '../shared/license/licenseCrypto'
// The HMAC signing secret. Lives in a GITIGNORED file (license.secret.json) so
// it is never pushed to source control, and is inlined into the bundle at build
// time by electron-vite so the packaged app can validate keys fully offline.
// The SAME secret is used by tools/generate-license-key.mjs to mint keys.
import licenseSecret from '../../license.secret.json'

/**
 * Device-locked license (single-device lock, fully offline).
 *
 * Flow:
 *  - activate(key): validate the key's HMAC signature, read a hardware
 *    fingerprint of THIS machine, and store {key, fingerprint} in license.json.
 *  - isActivated(): on every launch, re-read the current machine's fingerprint
 *    and compare it to the stored one. A mismatch blocks access ("this key is
 *    activated on a different device").
 *
 * The fingerprint uses ONLY hardware-level identifiers that survive an OS
 * reinstall / disk format: CPU manufacturer + model, motherboard serial, and
 * BIOS/UEFI serial. It deliberately avoids MAC address, Windows machine GUID,
 * hostname, and disk serial (all of which change on reinstall). If some serials
 * are missing or are junk placeholders they are dropped and we fall back to
 * whatever IS available, never throwing.
 *
 * NOTE: this runs ONLY in the main process. The renderer talks to it via IPC.
 * The pure crypto/fingerprint math lives in src/shared/license/licenseCrypto.ts
 * (secret-free, unit-tested); only the actual SECRET and the OS/hardware + file
 * I/O live here.
 */

const SECRET = licenseSecret.secret

interface LicenseRecord {
  v: 1
  key: string
  fingerprint: string
  activatedAt: number
}

function licensePath(): string {
  return join(app.getPath('userData'), 'license.json')
}

/**
 * Read this machine's hardware fingerprint. Never throws: on any error reading
 * the hardware we fall back to the sentinel hash so the caller can still decide
 * what to do rather than crashing.
 */
export async function getMachineFingerprint(): Promise<string> {
  try {
    const [cpu, board, bios] = await Promise.all([si.cpu(), si.baseboard(), si.bios()])
    return computeFingerprint({
      cpuManufacturer: cpu.manufacturer,
      cpuBrand: cpu.brand,
      baseboardSerial: board.serial,
      biosSerial: bios.serial
    })
  } catch {
    return computeFingerprint({})
  }
}

// --- license file -----------------------------------------------------------

function readLicense(): LicenseRecord | null {
  const p = licensePath()
  if (!existsSync(p)) return null
  try {
    const rec = JSON.parse(readFileSync(p, 'utf8')) as LicenseRecord
    if (!rec || rec.v !== 1 || typeof rec.key !== 'string' || typeof rec.fingerprint !== 'string') {
      return null
    }
    return rec
  } catch {
    return null
  }
}

function writeLicense(rec: LicenseRecord): void {
  writeFileSync(licensePath(), JSON.stringify(rec), { encoding: 'utf8', mode: 0o600 })
}

/** True if a license file already exists on this machine. */
export function hasLicenseFile(): boolean {
  return existsSync(licensePath())
}

/**
 * Activate this device with a license key. The key must have been issued for
 * THIS machine's fingerprint (a key made for another device will not validate).
 * On success we record it in license.json.
 */
export async function activate(key: string): Promise<{ ok: boolean; reason?: LicenseStatus['reason'] }> {
  const norm = normalizeKey(key)
  const fingerprint = await getMachineFingerprint()
  if (!validateKeyForFingerprint(norm, fingerprint, SECRET)) {
    return { ok: false, reason: 'invalid_key' }
  }
  writeLicense({ v: 1, key: norm, fingerprint, activatedAt: Date.now() })
  return { ok: true }
}

/**
 * Check activation status on launch. The stored key is re-validated against the
 * CURRENT machine fingerprint every time, so a license.json copied to another
 * computer (or a swapped motherboard) fails with device_mismatch.
 */
export async function isActivated(): Promise<LicenseStatus> {
  const rec = readLicense()
  if (!rec) return { activated: false, reason: 'not_activated' }
  const currentFp = await getMachineFingerprint()
  if (!validateKeyForFingerprint(rec.key, currentFp, SECRET)) {
    return { activated: false, reason: 'device_mismatch' }
  }
  return { activated: true }
}

export function registerLicenseIpc(): void {
  ipcMain.handle('license:status', () => isActivated())
  ipcMain.handle('license:activate', (_e, key: string) => activate(key))
  ipcMain.handle('license:fingerprint', () => getMachineFingerprint())
}
