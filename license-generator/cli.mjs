#!/usr/bin/env node
// Command-line license generator (alternative to the UI in server.mjs).
//
//   npm run license:gen -- <fingerprint>
//   node license-generator/cli.mjs <fingerprint>
//
// Prints the device-locked license key for the given 64-hex-char fingerprint.
import { isValidFingerprint, licenseKeyForFingerprint, loadSecret } from './keygen.mjs'

const fingerprint = process.argv[2]
if (!fingerprint) {
  console.error('Usage: node license-generator/cli.mjs <fingerprint>')
  console.error('  <fingerprint> = the 64-hex-char device fingerprint from the Activation screen / Settings.')
  process.exit(1)
}
if (!isValidFingerprint(fingerprint)) {
  console.error('ERROR: invalid fingerprint — expected 64 hexadecimal characters (a SHA-256 hash).')
  process.exit(1)
}

let secret
try {
  secret = loadSecret()
} catch (e) {
  console.error('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
}

console.log(licenseKeyForFingerprint(fingerprint, secret))
