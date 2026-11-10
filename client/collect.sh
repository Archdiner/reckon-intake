#!/usr/bin/env bash
# One-command latest50 collection and verified private upload.
set -euo pipefail
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENDPOINT='https://paxel-intake.aarizvi06.workers.dev'
MODE=collect
if [ "${1:-}" = '--export-only' ]; then MODE=export; shift; fi
if [ "$#" -ne 0 ]; then echo 'Usage: bash collect.sh [--export-only]' >&2; exit 2; fi
command -v python3 >/dev/null || { echo 'Python 3 is required.' >&2; exit 1; }
umask 077
ui() { python3 "$HERE/reckon_ui.py" "$@"; }
OUT="$PWD/coding-session-export-$(date -u +%Y%m%dT%H%M%SZ)-$$"
[ -n "${RECKON_BANNER_SHOWN:-}" ] || ui banner 'Session intake · up to 50 of your newest coding conversations'
ui info 'Reckon collects up to your 50 newest conversations from the coding agents on this computer. Empty captures and automated approval checks are excluded; subagent runs attach to their conversation.'
ui warn 'Known key-like values are masked in a copy before upload. Patterns can miss secrets and personal information.'
ui note 'Consent is handled outside this tool. Your export and receipt stay on this computer.'
if [ "$MODE" = collect ]; then
 ui note "Sending to: $ENDPOINT (private storage; no public transcript links)"
 if [ -z "${SESSION_UPLOAD_TOKEN:-}" ]; then
  [ -t 0 ] || { echo 'Set SESSION_UPLOAD_TOKEN privately, or run interactively to enter it.' >&2; exit 1; }
  IFS= read -r -s -p 'Upload token (hidden): ' SESSION_UPLOAD_TOKEN; printf '\n'
 fi
 export SESSION_UPLOAD_TOKEN
fi
ui step 1 4 'Finding your recent conversations'
ui note "Local copy: ${OUT##*/}/ (in this folder)"
ui run 'Finding and copying sessions' -- bash "$HERE/export-coding-sessions.sh" --export --recent 50 --out "$OUT"
ui step 2 4 'Looking for possible secrets'
ui note 'Warnings only: nothing is changed or removed, and a clean scan is not proof of safety.'
ui run 'Scanning' -- bash "$HERE/export-coding-sessions.sh" --scan "$OUT"
ui step 3 4 'Masking detected keys and packing your copy'
RAW_OUT="$OUT"
OUT=$(python3 "$HERE/mask-export.py" "$RAW_OUT")
ui note 'Known key-like values are masked in this copy. Patterns can miss secrets; originals stay unchanged.'
python3 "$HERE/pack-export.py" "$OUT" "$OUT.tar.gz"
if [ "$MODE" = export ]; then
 ui ok 'Export saved on this computer. Nothing was uploaded.'
 ui note "Archive: $OUT.tar.gz"
 exit 0
fi
ui step 4 4 'Uploading privately'
ui note 'Masking is best effort, not proof that the export contains no secrets.'
python3 "$HERE/upload-archive.py" "$OUT.tar.gz" --endpoint "$ENDPOINT"
