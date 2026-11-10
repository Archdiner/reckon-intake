# Reckon session intake

Reckon collects your newest local AI coding conversations (Claude Code, Codex,
Cursor, Gemini, Antigravity, OpenCode, VS Code Copilot and Pi), makes a copy
with known key-like values masked, and uploads only that masked copy to private
storage for a research pilot. It runs on macOS and Linux.

This repository exists so that anyone asked to run the collector can read
exactly what runs on their machine, what leaves it, and what the server does
with it.

## Layout

- `install.sh` - the one-command launcher people run. Verifies the client
  download against a pinned SHA-256 before executing anything.
- `client/` - everything that runs on your computer: session discovery and
  export (`export-coding-sessions.sh`), deterministic secret masking
  (`mask-export.py`), packing, upload and verification. Bash + Python 3
  standard library only; no dependencies to install.
- `worker/` - the receiver: a Cloudflare worker plus a Durable Object identity
  registry, archive validation, upload admission limits and private-storage
  commit logic. `launcher.js` is the tiny redirect worker behind the stable
  public URL.
- `tools/build-client-assets.mjs` - regenerates `worker/client-assets.js`
  (the served installer + client bundle) from `install.sh` and `client/`.
- `worker/test-*.mjs` - the test suites (`npm test` inside `worker/`).

## What happens when someone runs it

1. `install.sh` opens browser sign-in (Cloudflare Access email code - no Google
   or GitHub app, no password) and downloads the client, verifying its pinned
   SHA-256 and exact file list before running it. The browser sign-in helper
   binary (cloudflared) is itself verified against pinned SHA-256 checksums.
2. The client finds up to 50 of your newest supported local coding
   conversations. Empty captures and automated approval-check sessions are
   excluded, not counted.
3. The original export stays on your machine, unchanged. The client scans it
   for possible secrets and builds a separate masked copy where detected
   key-like values are replaced by equal-length stars.
4. Only the masked copy is packed into a tar.gz and uploaded in 3 MiB parts.
5. The receiver re-validates the whole archive (hashes, manifest, tar
   structure, session limits), then commits the parts and a signed receipt in
   one storage commit. Uploads land in a private Hugging Face dataset operated
   by the project owner; nothing is public.

`--export-only` runs steps 1-3 and stops: everything stays on your computer.
`--resume-export /absolute/saved/export` re-masks and uploads an earlier saved
selection without collecting sessions again.

## What the masker does and does not do

Masking is deterministic local pattern matching - no AI service, no network
calls. It covers common provider key formats, JWT-like strings, private-key
blocks, Bearer values, secret assignments and URL credentials. **It can miss
secrets, and it does not anonymize names, emails, personal information or
code.** Originals remain on your machine either way. The full, honest list of
limits (including the 64 MiB per-document masking cap and which tools count
conversations how) is in [`client/README.md`](client/README.md) - read it
before running.

## Current known limits

- Antigravity transcripts are collected but report as unclassified instead of
  counting as conversations.
- Windows has not been tested on a real machine.
- Cross-tool replay of one conversation across tools is not deduplicated.
- This is a pilot: per-account upload allowance, size limits (512 MiB
  compressed) and a 50-account sign-up cap are enforced server-side.

## Verifying the served code against this repo

The client files here are the source of the bundle the launcher serves. The
deployed bundle's pinned SHA-256 (inside `install.sh`) comes from the
deployment pipeline; a zip rebuilt locally with
`node tools/build-client-assets.mjs` carries the same file contents but may
differ in bytes (zip metadata), so verify by comparing unpacked contents rather
than the archive digest.

## Running your own deployment

You need a Cloudflare account, a private Hugging Face dataset and a Hugging
Face token.

1. Copy `worker/paxel-intake.example.json` and `worker/reckon-intake.example.json`
   to your own wrangler configs, fill in `account_id`, and adjust names.
2. Set the worker secrets: `HF_TOKEN`, `INTAKE_TOKENS` (JSON map of hashed
   legacy tokens to participant names), optionally `REVOKED_PRINCIPALS`.
3. Put Cloudflare Access (email one-time code) in front of the worker's
   `/browser/*` routes.
4. Supply your deployment-private values outside git: the owner identity and
   extra-upload allowances in `worker/identity-registry.js`, and your
   accepted-upload history as `worker/accepted-history.js` (the committed
   versions are placeholders).
5. `npm ci && npm test` inside `worker/`, then `wrangler deploy -c <config>`.

## Tests

```bash
cd worker
npm ci
npm test
```

Four suites: receiver context/auth fail-closed behavior, single-upload
invariants, upload-cap semantics, and a real Miniflare (SQLite Durable Object)
platform test. Public tests use synthetic fixtures only; the live deployment's
private history is exercised through the same ledger code paths.

## License

MIT - see [LICENSE](LICENSE).
