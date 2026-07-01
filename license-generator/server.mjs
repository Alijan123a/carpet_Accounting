#!/usr/bin/env node
// Local license-generator app (UI).
//
// A tiny self-contained web app — no npm dependencies, never bundled into the
// Carpet Accounting installer (it lives outside src/ and outside the electron
// build output). Run it ONLY on your own machine:
//
//   npm run license:app
//
// It opens http://127.0.0.1:4599 in your browser. Paste a customer's device
// fingerprint (from their Activation screen or Settings → License) and it mints
// the license key bound to that device, using the shared secret in
// license.secret.json.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { isValidFingerprint, licenseKeyForFingerprint, loadSecret } from './keygen.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const HOST = '127.0.0.1'
const START_PORT = 4599

// Fail fast with a friendly message if the secret is missing/placeholder.
let SECRET
try {
  SECRET = loadSecret()
} catch (e) {
  console.error('ERROR: ' + (e instanceof Error ? e.message : String(e)))
  process.exit(1)
}

const INDEX = readFileSync(join(here, 'index.html'), 'utf8')

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1_000_000) req.destroy() // guard against absurd payloads
    })
    req.on('end', () => resolve(data))
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(INDEX)
    return
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    let fingerprint = ''
    try {
      fingerprint = JSON.parse(await readBody(req)).fingerprint
    } catch {
      /* fall through to validation error */
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    if (!isValidFingerprint(fingerprint)) {
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Invalid fingerprint. Expected 64 hexadecimal characters (a SHA-256 hash).'
        })
      )
      return
    }
    res.end(JSON.stringify({ ok: true, key: licenseKeyForFingerprint(fingerprint, SECRET) }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

function openBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' })
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
  } catch {
    /* ignore — the URL is printed below regardless */
  }
}

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1)
    } else {
      console.error('Failed to start server:', err.message)
      process.exit(1)
    }
  })
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`
    console.log(`License generator running at ${url}  (press Ctrl+C to stop)`)
    // Set LICENSE_APP_NO_OPEN=1 to skip auto-launching the browser (tests/headless).
    if (!process.env.LICENSE_APP_NO_OPEN) openBrowser(url)
  })
}

listen(START_PORT, 20)
