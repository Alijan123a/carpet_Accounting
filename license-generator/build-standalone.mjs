#!/usr/bin/env node
// Build a SELF-CONTAINED, double-clickable license generator.
//
//   npm run license:standalone
//
// Reads index.html + the shared secret and writes `standalone.html` with the
// secret embedded and the key computed entirely in the browser (Web Crypto) —
// no server, no CORS, works from file://. Because it contains the secret it is
// GITIGNORED; keep it on your own machine only. Regenerate it whenever you
// change the secret.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadSecret, KEY_CHARS } from './keygen.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const secret = loadSecret()

const template = readFileSync(join(here, 'index.html'), 'utf8')

// Client-side crypto — Web Crypto HMAC-SHA256; base32/slice/group identical to
// keygen.mjs / licenseCrypto.ts (verified equal in the unit tests + by hand).
const clientScript = `
      const $ = (id) => document.getElementById(id)
      const fpEl = $('fp'), genEl = $('gen'), errEl = $('err')
      const resultEl = $('result'), keyEl = $('key'), copyEl = $('copy'), copiedEl = $('copied')

      const SECRET = ${JSON.stringify(secret)}
      const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
      const KEY_CHARS = ${KEY_CHARS}, KEY_GROUP = 5

      function base32Encode(bytes) {
        let bits = 0, value = 0, out = ''
        for (const byte of bytes) {
          value = (value << 8) | byte; bits += 8
          while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
        }
        if (bits > 0) out += B32[(value << (5 - bits)) & 31]
        return out
      }
      function formatKey(raw) { return raw.match(new RegExp('.{1,' + KEY_GROUP + '}', 'g')).join('-') }
      async function keyFor(fp) {
        const enc = new TextEncoder()
        const k = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        const sig = await crypto.subtle.sign('HMAC', k, enc.encode(fp))
        return formatKey(base32Encode(new Uint8Array(sig)).slice(0, KEY_CHARS))
      }

      async function generate() {
        errEl.textContent = ''; copiedEl.textContent = ''
        const fp = fpEl.value.trim().toLowerCase()
        if (!fp) { errEl.textContent = 'Please paste a device fingerprint.'; return }
        if (!/^[0-9a-f]{64}$/.test(fp)) {
          resultEl.classList.add('hidden')
          errEl.textContent = 'Invalid fingerprint. Expected 64 hexadecimal characters (a SHA-256 hash).'
          return
        }
        genEl.disabled = true
        try { keyEl.textContent = await keyFor(fp); resultEl.classList.remove('hidden') }
        catch (e) { errEl.textContent = 'Failed: ' + (e && e.message ? e.message : e) }
        finally { genEl.disabled = false }
      }
      async function copyKey() {
        try { await navigator.clipboard.writeText(keyEl.textContent); copiedEl.textContent = 'Copied to clipboard.'; setTimeout(() => (copiedEl.textContent = ''), 1800) }
        catch { copiedEl.textContent = 'Copy failed — select the key manually.' }
      }
      genEl.addEventListener('click', generate)
      copyEl.addEventListener('click', copyKey)
      fpEl.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate() })
`

// Swap the single <script>…</script> block, and mark the title as offline.
const html = template
  .replace(/<script>[\s\S]*?<\/script>/, `<script>${clientScript}    </script>`)
  .replace('<title>License Generator — Carpet Accounting</title>', '<title>License Generator (offline) — Carpet Accounting</title>')
  .replace('Carpet Accounting — issue a device-locked key', 'Carpet Accounting — offline, device-locked key')

const outPath = join(here, 'standalone.html')
writeFileSync(outPath, html, 'utf8')
console.log('Wrote ' + outPath)
console.log('Double-click it to generate keys offline. It contains the secret — do NOT share it or commit it.')
