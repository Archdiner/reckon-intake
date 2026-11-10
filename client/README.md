# Private coding-session intake

Run in your own terminal:

```bash
curl -fsSL https://paxel-intake.aarizvi06.workers.dev/install.sh | bash
```

Requires curl, Bash and Python 3 on macOS or Linux (Intel/Apple Silicon/ARM64). Browser sign-in is the default: enter the emailed code in your browser, then approve the terminal request. No upload token needs to be copied. Do not paste credentials into chat or a command. The launcher downloads the private client after authentication, verifies its pinned checksum and installs it in a private `~/paxel-intake.*` folder. No Docker, unzip command or storage account is needed.

The default run finds up to 50 of your newest supported local conversations across eight implemented adapters. A conversation is one user-started thread: records are grouped by the thread ids the tools write, empty captures and automated approval checks (such as Codex guardian reviews) are excluded rather than counted, and subagent runs attach to their root conversation as context files instead of consuming slots. Fewer than 50 conversations are exported when fewer qualify; nothing is padded. Conversation grouping needs Python 3; without it the exporter falls back to the newest 50 files and says so. It keeps an original local export, scans for possible secrets, then creates a separate copy with detected key-like string values replaced by equal-length stars. Only that derived copy is packed and uploaded to private storage. Original session stores and the original export remain unchanged. Consent is handled outside the script. Pattern matching can miss secrets and does not anonymize personal information or code.

## Resume a retained export

If a previous run left a saved export folder, use its exact absolute path:

```bash
curl -fsSL https://paxel-intake.aarizvi06.workers.dev/install.sh | bash -s -- --resume-export /absolute/path/to/coding-session-export
```

This uses the same selected sessions. It does not rediscover, recollect or manually drop any sessions. The original raw archive and its old upload-state cache are not reused for a masked upload. A deterministic derived copy gets its own archive, recomputed manifest hashes and upload state. If that masked archive already exists, it is checked against the derived manifest before reuse. Corrupt masked archives are preserved under an .invalid-* name and rebuilt once from the same derived selection.

To create only a local export:

```bash
curl -fsSL https://paxel-intake.aarizvi06.workers.dev/install.sh | bash -s -- --export-only
```

Downloading the private client still requires browser sign-in, but this option does not upload transcripts.

## Progress, limits and retry

The terminal shows download bytes, collection/scan/compression stages, archive size, verified upload bytes and chunk counts. Long stages print elapsed-time activity. Upload completion is separate from server acceptance: the server checks the full archive and all session hashes before atomically saving parts and the verified receipt in one repository commit. Only an accepted receipt means the run completed.

Archives are bounded to 512 MiB compressed and 512 MiB expanded, 1-50 primary conversations (attached context files do not count against this) and 250 regular members. Network parts are at most 3 MiB. The configured ceiling is not a promise of unlimited capacity. Provider API, storage and commit quotas still apply. A long quota wait is reported without busy retrying.

Your local export, archive, `.upload-state.json` and `.receipt.json` are retained. Private staging state contains no plaintext token and helps avoid retransmitting completed parts after a pause. Uncommitted provider objects may expire; the client can re-stage the same archive once if the server reports this specific condition. It will not discard good staging state merely because the network is slow or a quota is exhausted.

After an upload error, resume from the original saved export path. This rebuilds/checks the same masked copy and reuses its upload state:

```bash
curl -fsSL https://paxel-intake.aarizvi06.workers.dev/install.sh | bash -s -- --resume-export /absolute/path/to/original-export
```

It opens browser sign-in again if needed. Keep the export and archive until acceptance. Temporary disk space at least the archive size plus 16 MiB is needed for the immutable upload snapshot.

The verified browser identity maps to a stable opaque Reckon ID and a private uploader namespace. The existing owner's namespace and history stay unchanged. Different batches use different archive-digest paths. Machines are not separately labeled. Each verified signer receives their own stable Reckon identity and isolated uploader namespace. Public sign-up is limited to 50 total auth seats; more sign-ins are blocked, not automatically upgraded. Advanced owner-token fallback remains for existing scripts, not normal use. Do not share owner credentials.

Discovery has synthetic Linux coverage for Claude Code, Codex, Cursor, Gemini, Antigravity, opencode, VS Code Copilot and the Pi coding agent (per-project session JSONLs under the Pi agent sessions dir, plus the legacy flat layout). OpenCode SQLite extraction reads both the newer session_v2/session_message/session_part family and legacy session/message/part, deduplicating by session ID with newer-family rows preferred; an empty recognized database emits a visible coverage note. This fixes a confirmed code gap, but the cause of any specific missing session still needs a local discovery check. Of these, Claude Code, Codex, Cursor, opencode, VS Code Copilot and Pi require a genuine human turn for a file to count as a conversation; Gemini files count on a positive human-turn signal; Antigravity transcripts are collected but currently report as unclassified instead of counting. A real Mac run confirmed discovery, copying, scanning and packing of 50 sessions, but first real-data upload completion remains unverified. Windows has not been tested on a real machine. Ranking uses available session timestamps and falls back to file modification time when unsupported; modification-time fallback can mis-rank old copied logs. A filename date alone is not the last event time.

## Deterministic key masking

`mask-export.py` uses only local deterministic rules, no AI service or network calls. It masks common provider key/token formats, JWT-like strings, private-key blocks, Bearer values, common secret assignments, URL passwords and token query parameters, and string values in named secret fields. JSON/JSONL is decoded and re-encoded so stars do not break its syntax; keys, arrays, scalar types and session counts stay intact. Plain text transcripts use the same patterns. Session hashes and sizes describe the masked bytes.

It does not blanket-mask arbitrary long identifiers, emails, names, code or numbers. Unknown formats, encoded content, split secrets and unusual fields can be missed. Placeholders and ordinary key-related prose are generally left alone. False positives are possible; originals remain available locally. A malformed JSON-like line stops the upload rather than falling back to uploading it unchanged. Failure messages never print a matched value. Masking counts are not a proof that all secrets were found.

Masking currently stops safely if a whole `.json` document or one `.jsonl` record is larger than 64 MiB. Large JSONL files with smaller records are read one line at a time. No session is silently dropped when this limit is reached. The original export stays available for a future supported masking path.

The low-level uploader CLI requires the current masking marker in every manifest record by default. A marker prevents accidental use of an old raw archive, but is not evidence that every secret was found. The normal collect/resume commands create it after masking. `--allow-unmasked` is an explicit low-level override for intentional raw transport testing; the launcher never adds it.

The live large-archive transport test accepted and exactly recovered 50 synthetic sessions in a 401,627,460-byte compressed archive (128 distinct parts). Server finalization took 226 seconds in that test, mostly including network waits; this is not a per-request CPU measurement. Finalization now has a separate 600-second client wait, while part requests remain at 180 seconds. These results prove the tested transport case, not all possible 512 MiB archives or the user's own masked export.

## Browser sign-in (default)

The hosted `install.sh` opens browser sign-in for your own email. Enter the
emailed code in the browser, then approve the terminal request. The terminal
receives a short-lived credential privately. No upload token needs to be copied.
Public browser sign-up is supported after server activation, up to 50 total auth seats. A changed identity must be explicitly re-linked;
email alone does not merge identities. Each run uses a temporary helper home, so
helper credentials are removed after sign-in. The browser's login session can last
up to six hours. An expired or revoked upload credential stops the upload and keeps
its local files. Retry the same installer command to sign in again.

To resume, use the hosted installer with `--resume-export /absolute/saved/export`.
It reuses the same selection, makes or verifies the masked copy, and resumes its
archive. It does not search again or drop oversized sessions. Documents or single
records above the masker's 64 MiB limit fail closed with the original kept locally.
This limit is per JSON document or text/JSONL record, not the whole JSONL file.

If `RECKON_ACCESS_TOKEN` was manually set and is stale, run
`unset RECKON_ACCESS_TOKEN` before retrying the same installer command. Advanced
owner-token support remains available for existing scripts; it is not the normal
sign-in flow. Do not paste a credential into a command or send it in chat.


## Public pilot upload limits

The generic command collects each person's own latest 50 supported conversations. The
owner-specific resume path must not be shared. An email code verifies each signer;
a changed principal or email requires explicit re-linking, not automatic merging.

Per batch: up to 50 conversations and 512 MiB compressed/expanded. Per identity: 512 MiB
and 3 new archives per day, 1 GiB and 10 new archives total. Across the pilot: 2 GiB
and 20 new archives per day, 10 GiB and 100 new archives total. Unaccepted reservations expire after 24 hours and release their reserved capacity.
A write that may already have committed stays reserved until the stored receipt is
checked, so a timeout cannot bypass storage limits. Accepted archives keep counting
toward total storage bounds. Pilot totals begin with this public-signup release;
the existing owner archive and earlier transport fixtures remain preserved outside
this new admission ledger. Retrying the same exact
archive is idempotent and does not reserve storage twice. A limit never removes
sessions or recollects them; the local export/archive stays for a later retry.

Global admission allows at most four part requests and one finalization at once.
There is also a 1,000 authenticated upload-request daily limit per identity and
10,000 across the service. Temporary busy responses retain the same archive for
retry. These controls are not a hard billing cap against malicious public traffic.
Cloudflare Access Free is capped at 50 total active sign-in seats. The backend
reserves one existing owner identity and allows 49 new identities.
