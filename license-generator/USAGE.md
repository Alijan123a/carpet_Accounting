# License Generator (private tool)

This folder is a **standalone key-generation tool for the app owner only**. It is
**not** part of the Carpet Accounting app and is **never** bundled into the
installer / `.exe` (electron-builder only ships `out/**`, and this folder is
outside `src/` and the build output).

Keep this tool — and `license.secret.json` — on your own machine only.

## Prerequisites

Create the signing secret once (from the project root):

```
cp license.secret.example.json license.secret.json   # then edit it
```

Set `secret` in `license.secret.json` to a long random string. The **same**
secret is embedded in the shipped app (so it can validate keys offline) and used
here to mint them. `license.secret.json` is gitignored — never commit it.

## How keys work

A license key is `HMAC-SHA256(secret, deviceFingerprint)` (base32, 25 chars,
shown as `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`). Because the key is derived from the
customer's hardware fingerprint, it only activates on **that** device — copying
it to another computer will not work.

## Flow

1. Customer installs the app → the **Activation** screen shows their device
   fingerprint (64 hex characters). They copy it and send it to you.
2. You generate a key for that fingerprint (UI or CLI below).
3. You send the key back. They paste it into Activation → the app is unlocked and
   locked to their machine.

If a customer changes hardware (new motherboard/CPU), their fingerprint changes;
generate a fresh key for the new fingerprint.

## Run — UI

```
npm run license:app
```

Opens `http://127.0.0.1:4599` in your browser. Paste the fingerprint, click
**Generate**, copy the key.

## Run — CLI

```
npm run license:gen -- <fingerprint>
# or
node license-generator/cli.mjs <fingerprint>
```
