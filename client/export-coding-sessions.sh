#!/bin/bash
# Local-only discovery/export helper for the private intake package.
# Run bash collect.sh for one-command latest50 collection and verified upload.
# This file supports --list, --export, --scan only. No legacy upload routes.
# Discovery follows the reviewed Paxel v0.3.98.3 local-store adapters.
# Synthetic Linux fixtures tested; real macOS/Windows behavior not certified.
# Raw transcripts are not redacted. Consent is handled outside this script.
set -uo pipefail

# ---------------------------------------------------------------------------
# Paths (env-overridable, same variable names Paxel uses)
# ---------------------------------------------------------------------------
HOME="${HOME:-~}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude/projects}"
CODEX_DIR="${CODEX_DIR:-$HOME/.codex/sessions}"
GEMINI_DIR="${GEMINI_DIR:-$HOME/.gemini/tmp}"
ANTIGRAVITY_DIR="${ANTIGRAVITY_DIR:-$HOME/.gemini}"
OPENCODE_DIR="${OPENCODE_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/opencode}"
# Pi coding agent (canonical: earendil-works/pi): plain-JSONL sessions. The
# default store is per-project subdirs --<cwd with /, \\, : as ->-- under
# <agent>/sessions, agent dir default ~/.pi/agent; cwd is also in each file's
# first-line session header. Canonical upstream envs: PI_CODING_AGENT_DIR
# (agent dir) and PI_CODING_AGENT_SESSION_DIR (relocates the whole session
# store to one flat directory; honored below). Pi's --n flag and settings.json
# sessionDir also relocate the store but are not discoverable from outside;
# PI_DIR (Reckon-only) can point at such a sessions root explicitly.
# PI_AGENT_DIR is a Reckon-only alias for the agent dir, not an upstream name.
# A v0.30.0 bug wrote session JSONLs flat into the agent dir; that legacy
# layout is scanned too. Every candidate file must carry a real top-level
# session header; the "pi (cwd unresolved)" fallback is only for valid
# headered sessions whose cwd is missing.
PI_AGENT_DIR="${PI_AGENT_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}}"
if [ -n "${PI_DIR:-}" ]; then
  : # Reckon-only override: PI_DIR is the sessions root.
elif [ -n "${PI_CODING_AGENT_SESSION_DIR:-}" ]; then
  PI_DIR="$PI_CODING_AGENT_SESSION_DIR"
else
  PI_DIR="$PI_AGENT_DIR/sessions"
fi

case "$(uname -s)" in
  Darwin)
    VSCODE_DIRS="${VSCODE_DIRS:-$HOME/Library/Application Support/Code/User/workspaceStorage
$HOME/Library/Application Support/Code - Insiders/User/workspaceStorage}"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    _appdata="${APPDATA:-$HOME/AppData/Roaming}"
    VSCODE_DIRS="${VSCODE_DIRS:-$_appdata/Code/User/workspaceStorage
$_appdata/Code - Insiders/User/workspaceStorage}"
    ;;
  *)
    VSCODE_DIRS="${VSCODE_DIRS:-$HOME/.config/Code/User/workspaceStorage
$HOME/.config/Code - Insiders/User/workspaceStorage}"
    ;;
esac

# Cursor session DBs (workspaceStorage + global state.vscdb), per OS, with
# the same WSL repoint Paxel uses when the Linux side has no usable data.
case "$(uname -s)" in
  Darwin)
    CURSOR_DIR="${CURSOR_DIR:-$HOME/Library/Application Support/Cursor/User/workspaceStorage}"
    CURSOR_GLOBAL_DB="${CURSOR_GLOBAL_DB:-$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb}"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    _cursor_appdata="${APPDATA:-$HOME/AppData/Roaming}"
    _cursor_appdata="${_cursor_appdata//\\//}"
    CURSOR_DIR="${CURSOR_DIR:-$_cursor_appdata/Cursor/User/workspaceStorage}"
    CURSOR_GLOBAL_DB="${CURSOR_GLOBAL_DB:-$_cursor_appdata/Cursor/User/globalStorage/state.vscdb}"
    ;;
  *)
    CURSOR_DIR="${CURSOR_DIR:-$HOME/.config/Cursor/User/workspaceStorage}"
    CURSOR_GLOBAL_DB="${CURSOR_GLOBAL_DB:-$HOME/.config/Cursor/User/globalStorage/state.vscdb}"
    if grep -qi microsoft /proc/version 2>/dev/null; then
      # WSL: if the Linux-side Cursor has no usable data, use the Windows side.
      if [ -z "$(find "$CURSOR_DIR" -maxdepth 2 -name state.vscdb -print -quit 2>/dev/null || true)" ] \
         && [ ! -f "$CURSOR_GLOBAL_DB" ]; then
        for _win_cursor in /mnt/c/Users/*/AppData/Roaming/Cursor/User; do
          [ -d "$_win_cursor/workspaceStorage" ] || continue
          CURSOR_DIR="$_win_cursor/workspaceStorage"
          CURSOR_GLOBAL_DB="$_win_cursor/globalStorage/state.vscdb"
          if [ ! -d "$HOME/.cursor/projects" ] \
             && [ -d "${_win_cursor%/AppData/*}/.cursor/projects" ]; then
            CURSOR_PROJECTS_DIR="${_win_cursor%/AppData/*}/.cursor/projects"
          fi
          break
        done
      fi
    fi
    ;;
esac
CURSOR_PROJECTS_DIR="${CURSOR_PROJECTS_DIR:-$HOME/.cursor/projects}"

# Hard denylist, two case-insensitive match rules:
#   - DENY_COMPONENTS (built-in): exact '/'-separated path components, so
#     ".paxel" matches a real .paxel directory but NOT look-alike names
#     such as "myapp.paxel-notes".
#   - DENY_PATTERNS (operator extras via EXTRA_DENY_PATTERNS): path
#     substrings, for local assistant-platform data dirs you want excluded.
DENY_COMPONENTS=".paxel"
DENY_PATTERNS="${EXTRA_DENY_PATTERNS:-}"

path_denied() {
  local p pat
  p=$(printf '%s' "$1" | tr 'A-Z' 'a-z')
  case "/$p/" in */.paxel/*) return 0 ;; esac
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    pat=$(printf '%s' "$pat" | tr 'A-Z' 'a-z')
    case "$p" in *"$pat"*) return 0 ;; esac
  done <<EOF
$DENY_PATTERNS
EOF
  return 1
}

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
MODE="list"
OUT_DIR=""
DO_SCAN_DIR=""
SINCE_EPOCH=""
SINCE_ARG=""
TOOLS_WANTED=""
PROJECT_TOKENS=""
SESSIONS_FILE=""
INCLUDE_SUBAGENTS=0
RECENT_N=50
SEND_FROM=""
SEND_ENDPOINT=""
SEND_PARTICIPANT=""
SEND_TOKEN_ENV="SESSION_UPLOAD_TOKEN"
SEND_YES=0
SEND_HF_REPO=""
SEND_BATCH_ID=""
SEND_SRC_DIR=""

usage() { sed -n '2,80p' "$0"; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --list)               MODE="list"; shift ;;
    --export)             MODE="export"; shift ;;
    --collect)            MODE="collect"; shift ;;
    --scan)               MODE="scan"; DO_SCAN_DIR="$2"; shift 2 ;;
    --send)               MODE="send"; shift ;;
    --send-hf)            MODE="send-hf"; shift ;;
    --send-hf-bucket)     MODE="send-hf-bucket"; shift ;;
    --send-vb)            MODE="send-vb"; shift ;;
    --hf-repo)            SEND_HF_REPO="$2"; shift 2 ;;
    --recent)             RECENT_N="$2"; shift 2 ;;
    --from)               SEND_FROM="$2"; shift 2 ;;
    --endpoint)           SEND_ENDPOINT="$2"; shift 2 ;;
    --participant)        SEND_PARTICIPANT="$2"; shift 2 ;;
    --token-env)          SEND_TOKEN_ENV="$2"; shift 2 ;;
    --yes)                SEND_YES=1; shift ;;
    --out)                OUT_DIR="$2"; shift 2 ;;
    --force)              FORCE_OUT=1; shift ;;
    --project)            PROJECT_TOKENS="${PROJECT_TOKENS}$2
"; shift 2 ;;
    --sessions-file)      SESSIONS_FILE="$2"; shift 2 ;;
    --include-subagents)  INCLUDE_SUBAGENTS=1; shift ;;
    --since)              SINCE_ARG="$2"; shift 2 ;;
    --tool)               TOOLS_WANTED="${TOOLS_WANTED}$2
"; shift 2 ;;
    -h|--help)            usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

case "$RECENT_N" in
  ''|*[!0-9]*) echo "Bad --recent value '$RECENT_N' (digits only)" >&2; exit 1 ;;
esac
if [ "$RECENT_N" -lt 1 ] || [ "$RECENT_N" -gt 50 ]; then
  echo "Refusing: --recent must be between 1 and 50; there is no unlimited export." >&2
  exit 1
fi

want_tool() {
  [ -z "$TOOLS_WANTED" ] && return 0
  printf '%s' "$TOOLS_WANTED" | grep -qx "$1"
}

if [ -n "$SINCE_ARG" ]; then
  unit="${SINCE_ARG##*[0-9]}"
  n="${SINCE_ARG%"$unit"}"
  case "$unit" in
    d|w|m|y) ;;
    *) echo "Bad --since value '$SINCE_ARG' (use 30d, 8w, 2m, 1y)" >&2; exit 1 ;;
  esac
  case "$n" in
    ''|*[!0-9]*) echo "Bad --since value '$SINCE_ARG' (digits then d/w/m/y only)" >&2; exit 1 ;;
  esac
  days=$((n)); [ "$unit" = w ] && days=$((n * 7))
  [ "$unit" = m ] && days=$((n * 30)); [ "$unit" = y ] && days=$((n * 365))
  SINCE_EPOCH=$(( $(date +%s) - days * 86400 ))
fi

# ---------------------------------------------------------------------------
# Helpers (project resolution ported from Paxel's upload.sh)
# ---------------------------------------------------------------------------
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum   >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else echo "nohash"; fi
}
stable_hash6() {
  if command -v md5sum >/dev/null 2>&1; then printf '%s' "$1" | md5sum | cut -c1-6
  elif command -v md5 >/dev/null 2>&1; then printf '%s' "$1" | md5 | cut -c1-6
  else echo "000000"; fi
}
mtime_of() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
size_of()  { stat -c %s "$1" 2>/dev/null || stat -f %z "$1" 2>/dev/null || echo 0; }
slugify() {
  local s
  s="${1%/}"; s="${s##*/}"; s="${s%.git}"
  s=$(printf '%s' "$s" | tr -c 'A-Za-z0-9_.-' '-' | sed 's/--*/-/g; s/^-//; s/-$//')
  [ -z "$s" ] && s="project"
  printf '%s' "$s"
}
normalize_remote() {
  local n="$1"
  [ -z "$n" ] && { echo ""; return; }
  n=$(printf '%s' "$n" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  n="${n#ssh://}"; n="${n#https://}"; n="${n#http://}"
  n="${n#git@}"
  n=$(printf '%s' "$n" | sed 's#^[^/@]*@##')   # drop userinfo: remotes can embed tokens/passwords
  n="${n/://}"
  n="${n%.git}"
  printf '%s\n' "$n"
}
get_git_remote() {
  local cwd="$1"
  [ -n "$cwd" ] && [ -d "$cwd" ] || { echo ""; return; }
  normalize_remote "$(git -C "$cwd" remote get-url origin 2>/dev/null || true)"
}

# First "cwd" value found in a JSONL file (jq when present, grep fallback)
first_cwd_in_jsonl() {
  local f="$1" field="${2:-cwd}" cwd=""
  if command -v jq >/dev/null 2>&1; then
    cwd=$(jq -r --arg k "$field" '(.payload // .)[$k] // empty' "$f" 2>/dev/null | head -1)
  fi
  if [ -z "$cwd" ]; then
    cwd=$(grep -o "\"$field\":\"[^\"]*\"" "$f" 2>/dev/null | head -1 | sed "s/\"$field\":\"//;s/\"\$//")
  fi
  printf '%s\n' "$cwd"
}

# Recency basis for ranking bulk exports: prints "<epoch> <ts|mtime>".
# The session's content clock (last "timestamp":"..." field in the file)
# ranks first because later edits touch old logs and lie via mtime; files
# without a parseable timestamp fall back to mtime and are reported as
# such by the caller.
session_recency() {
  local f="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys,datetime,os
values=[]
for line in open(sys.argv[1],errors="replace"):
    try: obj=json.loads(line)
    except ValueError: continue
    if not isinstance(obj,dict): continue
    for key in ("end_time","endTime","timestamp","start_time","startTime"):
        value=obj.get(key)
        if not isinstance(value,str): continue
        try:
            dt=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
            if dt.tzinfo is not None: values.append(dt.timestamp())
        except (ValueError,OverflowError): pass
print(str(int(max(values)))+" ts" if values else str(int(os.stat(sys.argv[1]).st_mtime))+" mtime")' "$f"
  else
    printf '%s mtime\n' "$(mtime_of "$f")"
  fi
}

# Paxel's get_project_cwd order: sessions-index.json originalPath -> first
# non-queue-operation JSONL line's cwd -> empty (caller labels unresolved)
get_claude_project_cwd() {
  local project_dir="$1"
  local index_file="$project_dir/sessions-index.json"
  if [ -f "$index_file" ]; then
    local p=""
    if command -v jq >/dev/null 2>&1; then
      p=$(jq -r 'if type=="array" then .[0].originalPath // empty
                 elif type=="object" then (.entries // [])[0].originalPath // empty
                 else empty end' "$index_file" 2>/dev/null || true)
    fi
    [ -z "$p" ] && p=$(grep -o '"originalPath":"[^"]*"' "$index_file" 2>/dev/null | head -1 | sed 's/"originalPath":"//;s/"$//')
    [ -n "$p" ] && { printf '%s\n' "$p"; return; }
  fi
  local first_jsonl
  first_jsonl=$(find "$project_dir" -maxdepth 1 -name "*.jsonl" -size +0 -print -quit 2>/dev/null || true)
  if [ -n "$first_jsonl" ]; then
    local cwd=""
    while IFS= read -r line; do
      case "$line" in *'"type":"queue-operation"'*) continue ;; esac
      cwd=$(printf '%s' "$line" | grep -o '"cwd":"[^"]*"' | head -1 | sed 's/"cwd":"//;s/"$//' || true)
      [ -n "$cwd" ] && break
    done < "$first_jsonl"
    [ -n "$cwd" ] && { printf '%s\n' "$cwd"; return; }
  fi
  echo ""
}

# Cursor's plain-JSONL layout encodes the cwd in the project dir name.
# Hyphens inside real path components make this ambiguous (documented above).
decode_encoded_dir() {
  local enc="$1"
  printf '/%s\n' "${enc#-}" | tr '-' '/'
}

# --- Cursor workspace-name resolution (mirrors Paxel) -----------------------
# Encoding: every run of non-alphanumerics collapses to one "-", leading one
# dropped (lossy). Resolve dir names via the workspaceStorage workspace.json
# map first, then a filesystem decode walk, then the lossy flat decode.
cursor_projects_encode() {
  printf '%s' "$1" | sed -E 's|[^A-Za-z0-9]+|-|g; s|^-||; s|-$||'
}

_cursor_urldecode() {
  case "$1" in
    *%*) printf '%b' "${1//\%/\\x}" 2>/dev/null || printf '%s' "$1" ;;
    *)   printf '%s' "$1" ;;
  esac
}

get_cursor_workspace_path() {
  local ws_json="$1/workspace.json"
  [ -f "$ws_json" ] || { echo ""; return; }
  local folder
  folder=$(grep -o '"folder":"[^"]*"' "$ws_json" 2>/dev/null | head -1 | sed 's/"folder":"//;s/"$//' || true)
  folder="${folder%$'\r'}"
  printf '%s\n' "${folder#file://}"
}

_CURSOR_WS_MAP=""
_CURSOR_WS_MAP_LOADED=0
load_cursor_ws_map() {
  [ "$_CURSOR_WS_MAP_LOADED" -eq 1 ] && return 0
  _CURSOR_WS_MAP_LOADED=1
  [ -d "${CURSOR_DIR:-}" ] || return 0
  local ws_dir p enc tab
  tab=$(printf '\t')
  for ws_dir in "$CURSOR_DIR"/*/; do
    [ -f "${ws_dir}workspace.json" ] || continue
    p=$(get_cursor_workspace_path "${ws_dir%/}")
    [ -z "$p" ] && continue
    p=$(_cursor_urldecode "$p")
    case "$p" in /[A-Za-z]:/*) p="${p#/}" ;; esac   # /c:/Users -> c:/Users
    enc=$(cursor_projects_encode "$p")
    [ -z "$enc" ] && continue
    _CURSOR_WS_MAP="${_CURSOR_WS_MAP}${enc}${tab}${p}
"
  done
  return 0
}

# Reverse the lossy encoding by walking the live filesystem: each "-" either
# extends the current segment ("-", "_", ".") or starts a new one ("/").
_cursor_decode_walk() {
  local cur="$1" rest="$2"
  if [ -z "$rest" ]; then
    if [ -d "$cur" ]; then printf '%s\n' "$cur"; return 0; fi
    return 1
  fi
  local head="${rest%%-*}" tail="" sep cand probe
  [ "$rest" != "$head" ] && tail="${rest#*-}"
  for sep in / - _ .; do
    cand="${cur}${sep}${head}"
    probe=""
    for probe in "$cand"*; do break; done
    [ -e "$probe" ] || continue
    if _cursor_decode_walk "$cand" "$tail"; then return 0; fi
  done
  return 1
}

# Resolve a ~/.cursor/projects dir name to its workspace path; empty when
# unattributable, lossy decode as documented last resort.
cursor_ws_for_dir() {
  local enc="${1#-}" hit
  case "$enc" in
    empty-window|*[!A-Za-z0-9-]*) decode_encoded_dir "$enc"; return ;;
  esac
  case "$enc" in *[!0-9]*) : ;; *) decode_encoded_dir "$enc"; return ;; esac
  load_cursor_ws_map
  hit=$(printf '%s' "$_CURSOR_WS_MAP" | awk -F '\t' -v e="$enc" '$1 == e { print $2; exit }' || true)
  if [ -n "$hit" ]; then printf '%s\n' "$hit"; return; fi
  hit=$(_cursor_decode_walk "" "$enc" || true)
  if [ -n "$hit" ]; then printf '%s\n' "$hit"; return; fi
  decode_encoded_dir "$enc"
}

passes_since() {
  [ -z "$SINCE_EPOCH" ] && return 0
  [ "$(mtime_of "$1")" -ge "$SINCE_EPOCH" ] 2>/dev/null
}

# ---------------------------------------------------------------------------
# Inventory: one TSV line per discovered session file:
#   tool \t project_label \t cwd \t source_path
# ---------------------------------------------------------------------------
INVENTORY=$(mktemp "${TMPDIR:-/tmp}/session-inventory.XXXXXX")
SELECTED=""
trap cleanup EXIT

inv_add() {  # inv_add <tool> <cwd-or-label> <src>
  local src="$3" label="$2"
  [ -L "$src" ] && { echo "  SKIP (symlink): $src" >&2; return 0; }
  [ -f "$src" ] || return 0            # regular files only (no devices/fifos)
  path_denied "$src"   && { echo "  SKIP (denylisted path): $src" >&2; return 0; }
  path_denied "$label" && { echo "  SKIP (denylisted project): $label ($src)" >&2; return 0; }
  passes_since "$src" || return 0
  local label="$2"
  [ -z "$label" ] && label="unresolved"
  printf '%s\t%s\t%s\t%s\n' "$1" "$label" "$2" "$src" >> "$INVENTORY"
}

EXTRACT_DIR=""
EXTRACT_PY=""
DB_NOTE_PRINTED=0

cleanup() {
  rm -f "$INVENTORY" ${SELECTED:+"$SELECTED" "${SELECTED}.convreport"}
  [ -n "$EXTRACT_DIR" ] && rm -rf "$EXTRACT_DIR"
}

# Lazily create the extraction workspace + the stdlib-sqlite extractor.
# DB tools degrade to a printed note when python3 is unavailable.
ensure_extract() {
  [ -n "$EXTRACT_PY" ] && return 0
  if ! command -v python3 >/dev/null 2>&1; then
    [ "$DB_NOTE_PRINTED" -eq 0 ] && {
      echo "Note: python3 unavailable; Cursor/opencode SQLite session stores are skipped." >&2
      DB_NOTE_PRINTED=1
    }
    return 1
  fi
  [ -z "$EXTRACT_DIR" ] && EXTRACT_DIR=$(mktemp -d "${TMPDIR:-/tmp}/session-extract.XXXXXX")
  cat > "$EXTRACT_DIR/extract_dbs.py" <<'EXTRACTPY'
import json, os, re, sqlite3, sys, urllib.parse, datetime

def iso(ms):
    try:
        return datetime.datetime.fromtimestamp(int(ms)/1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    except Exception:
        return None

def open_ro(db):
    return sqlite3.connect('file:%s?mode=ro' % urllib.parse.quote(db), uri=True)

def tables(con):
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}

def dump_jsonl(out, lines, epoch_ms):
    with open(out, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')
    if epoch_ms:
        try: os.utime(out, (int(epoch_ms)/1000, int(epoch_ms)/1000))
        except Exception: pass

def extract_cursor(db, out_dir, default_ws, seen):
    con = open_ro(db)
    if 'cursorDiskKV' not in tables(con):
        return []
    rows = con.execute("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'").fetchall()
    results = []
    for _key, value in rows:
        try: meta = json.loads(value)
        except Exception: continue
        cid = meta.get('composerId')
        if not cid or not isinstance(cid, str) or cid in seen:
            continue
        seen.add(cid)
        created = meta.get('createdAt') or 0
        ws = ''
        wsi = meta.get('workspaceIdentifier')
        if isinstance(wsi, dict):
            uri = wsi.get('uri')
            if isinstance(uri, dict):
                ws = uri.get('fsPath') or ''
        if not ws:
            ws = default_ws or ''
        headers = meta.get('fullConversationHeadersOnly') or []
        bids = [h.get('bubbleId') for h in headers if isinstance(h, dict) and h.get('bubbleId')]
        if not bids:
            continue
        bubbles = {}
        try:
            for k, v in con.execute("SELECT key, value FROM cursorDiskKV WHERE key >= ? AND key < ?",
                                    ('bubbleId:%s:' % cid, 'bubbleId:%s;' % cid)):
                bubbles[k.rsplit(':', 1)[-1]] = v
        except Exception:
            pass
        try:
            marks = ','.join('?' * len(bids))
            for k, v in con.execute("SELECT key, value FROM cursorDiskKV WHERE key IN (%s)" % marks,
                                    ['bubbleId:' + b for b in bids]):
                bubbles.setdefault(k.split(':', 1)[-1], v)
        except Exception:
            pass
        lines = [json.dumps({'type': '_cursor_meta', 'composerId': cid, 'createdAt': created,
                             'workspace': ws, 'timestamp': iso(created)}, separators=(',', ':'))]
        body = 0
        for bid in bids:
            raw = bubbles.get(bid)
            if raw is None:
                continue
            try: b = json.loads(raw)
            except Exception: continue
            tfd = b.get('timingInfo') or {}
            ts = iso(tfd.get('clientEndTime') or b.get('createdAt'))
            role = 'assistant' if str(b.get('type')) == '2' else 'user'
            text = b.get('text') or ''
            tool = b.get('toolFormerData') or {}
            content = []
            if text:
                content.append({'type': 'text', 'text': text})
            if role == 'assistant' and tool.get('name'):
                params = tool.get('params')
                content.append({'type': 'tool_use', 'name': tool.get('name'),
                                'input': params if isinstance(params, (dict, list)) else {}})
            if content:
                lines.append(json.dumps({'type': role, 'message': {'role': role, 'content': content},
                                         'timestamp': ts}, separators=(',', ':')))
                body += 1
            if tool.get('result') is not None:
                lines.append(json.dumps({'type': 'user', 'message': {'role': 'user', 'content': [
                    {'type': 'tool_result', 'content': str(tool.get('result'))[:4000]}]},
                    'timestamp': ts}, separators=(',', ':')))
        if body == 0:
            continue
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', cid)
        out = os.path.join(out_dir, safe + '.jsonl')
        if os.path.exists(out):
            continue  # per-workspace DB wins over the global DB
        dump_jsonl(out, lines, created)
        results.append((out, ws, int(created/1000) if created else 0))
    con.close()
    return results

def extract_opencode(db, out_dir):
    # OpenCode 2 (current) writes the session_v2 / session_message / session_part
    # family; OpenCode 1 rows live in the legacy session / message / part tables
    # and are never imported reliably (anomalyco/opencode#41217 and follow-ups).
    # Read both families, V2 first, deduplicated by session id, so a DB holding
    # only legacy rows, only V2 rows, or a migrated mix all export. A database
    # whose tables yield nothing prints a note instead of failing silently.
    con = open_ro(db)
    have = tables(con)
    results = []
    seen = set()
    found_family = False

    def emit(sid, directory, title, version, agent, created_ms, messages):
        # messages: list of (mid, time_created_ms, message_obj, parts_list)
        if not sid or sid in seen:
            return False
        lines = [json.dumps({'type': 'opencode_session_meta', 'id': sid, 'title': title or '',
                             'directory': directory or '', 'agent': agent or '',
                             'version': str(version or ''), 'timestamp': iso(created_ms)},
                            separators=(',', ':'))]
        body = 0
        for mid, mtc, mobj, parts in messages:
            lines.append(json.dumps({'type': 'opencode_message', 'message': mobj, 'parts': parts,
                                     'timestamp': iso(mtc)}, separators=(',', ':')))
            body += 1
        if body == 0:
            return False
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', str(sid))
        out = os.path.join(out_dir, safe + '.jsonl')
        if os.path.exists(out):
            return False
        dump_jsonl(out, lines, created_ms)
        results.append((out, directory or '', int(created_ms/1000) if created_ms else 0))
        seen.add(sid)
        return True

    def fetch_parts(table, order_col, mid):
        parts = []
        if table not in have:
            return parts
        try:
            for ptc, pdata in con.execute(
                    "SELECT time_created, data FROM %s WHERE message_id = ? ORDER BY %s" % (table, order_col),
                    (mid,)).fetchall():
                try: parts.append({'t': ptc, 'p': json.loads(pdata)})
                except Exception: pass
        except Exception:
            pass
        return parts

    if 'session_v2' in have:
        found_family = True
        cols = {r[1] for r in con.execute("PRAGMA table_info(session_v2)")}
        pick = lambda c: c if c in cols else 'NULL'
        q = ("SELECT id, %s, %s, %s, %s, %s FROM session_v2 WHERE parent_id IS NULL"
             % (pick('directory'), pick('title'), pick('version'), pick('agent'), pick('time_created')))
        try:
            rows = con.execute(q).fetchall()
        except Exception:
            rows = []
        for sid, directory, title, version, agent, tc in rows:
            created_ms = int(tc) if tc else 0
            messages = []
            if 'session_message' in have:
                # opencode >= 1.18 keeps the turn's role in the session_message.type
                # column; the data blob has no "role" key (verified against the
                # documented 2.0 schema). Carry it into the exported record.
                mcols = {r[1] for r in con.execute("PRAGMA table_info(session_message)")}
                tsel = 'type' if 'type' in mcols else 'NULL'
                try:
                    mrows = con.execute(
                        "SELECT id, time_created, %s, data FROM session_message WHERE session_id = ? ORDER BY seq" % tsel,
                        (sid,)).fetchall()
                except Exception:
                    try:
                        mrows = con.execute(
                            "SELECT id, time_created, %s, data FROM session_message WHERE session_id = ? ORDER BY time_created" % tsel,
                            (sid,)).fetchall()
                    except Exception:
                        mrows = []
                for mid, mtc, mtype, mdata in mrows:
                    try: mobj = json.loads(mdata)
                    except Exception: continue
                    if isinstance(mobj, dict) and mtype and 'role' not in mobj:
                        mobj['role'] = mtype
                    messages.append((mid, mtc, mobj, fetch_parts('session_part', 'ordinal', mid)))
            emit(sid, directory, title, version, agent, created_ms, messages)

    if 'session' in have:
        found_family = True
        cols = {r[1] for r in con.execute("PRAGMA table_info(session)")}
        pick = lambda c: c if c in cols else 'NULL'
        q = ("SELECT id, %s, %s, %s, %s, %s FROM session WHERE parent_id IS NULL"
             % (pick('directory'), pick('title'), pick('version'), pick('agent'), pick('time_created')))
        try:
            rows = con.execute(q).fetchall()
        except Exception:
            rows = []
        for sid, directory, title, version, agent, tc in rows:
            created_ms = int(tc) if tc else 0
            messages = []
            try:
                mrows = con.execute(
                    "SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created",
                    (sid,)).fetchall()
            except Exception:
                mrows = []
            for mid, mdata, mtc in mrows:
                try: mobj = json.loads(mdata)
                except Exception: continue
                messages.append((mid, mtc, mobj, fetch_parts('part', 'time_created', mid)))
            emit(sid, directory, title, version, agent, created_ms, messages)

    con.close()
    if found_family and not results:
        print('# opencode database found but no sessions could be exported from it '
              '(schema may have changed; please report this).')
    return results

def antigravity_attr(db, transcript):
    cwd = ''
    try:
        con = open_ro(db)
        row = con.execute("SELECT data FROM trajectory_metadata_blob LIMIT 1").fetchone()
        con.close()
        if row and row[0]:
            blob = row[0]
            text = blob.decode('utf-8', 'ignore') if isinstance(blob, (bytes, bytearray)) else str(blob)
            m = re.search(r'file:///[^"\x00-\x1f]+', text)
            if m:
                cwd = urllib.parse.unquote(m.group(0)[len('file://'):])
    except Exception:
        pass
    if not cwd and transcript and os.path.isfile(transcript):
        try:
            with open(transcript, errors='replace') as fh:
                head = fh.read(4 * 1024 * 1024)
            m = re.search(r'"Cwd":"\\"([^\\"]+)\\""', head)
            if m:
                cwd = m.group(1)
            else:
                m = re.search(r'read and write access to the following workspace\(s\):\\n- ([^\\"]+)', head)
                if m:
                    cwd = m.group(1)
        except Exception:
            pass
    return cwd

def main():
    mode = sys.argv[1]
    if mode == 'cursor':
        _db, out_dir, default_ws, seen_file = sys.argv[2:6]
        os.makedirs(out_dir, exist_ok=True)
        seen = set()
        if os.path.isfile(seen_file):
            seen = set(open(seen_file).read().splitlines())
        results = extract_cursor(_db, out_dir, default_ws, seen)
        with open(seen_file, 'a') as fh:
            for cid in sorted(seen):
                fh.write(cid + '\n')
        for out, ws, epoch in results:
            print('%s\t%s\t%d' % (out, ws, epoch))
    elif mode == 'opencode':
        _db, out_dir = sys.argv[2:4]
        os.makedirs(out_dir, exist_ok=True)
        for out, directory, epoch in extract_opencode(_db, out_dir):
            print('%s\t%s\t%d' % (out, directory, epoch))
    elif mode == 'antigravity-attr':
        print(antigravity_attr(sys.argv[2], sys.argv[3]))

main()
EXTRACTPY
  EXTRACT_PY="$EXTRACT_DIR/extract_dbs.py"
}

collect_claude() {
  [ -d "$CLAUDE_DIR" ] || return 0
  local project_dir cwd f
  for project_dir in "$CLAUDE_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    cwd=$(get_claude_project_cwd "${project_dir%/}")
    [ -z "$cwd" ] && cwd="$(basename "${project_dir%/}") (cwd unresolved)"
    while IFS= read -r f; do
      [ -n "$f" ] && inv_add claude "$cwd" "$f"
    done < <(find "$project_dir" -maxdepth 1 \( -type f -o -type l \) -name "*.jsonl" -not -name "_*" 2>/dev/null)
    if [ "$INCLUDE_SUBAGENTS" -eq 1 ]; then
      while IFS= read -r f; do
        [ -n "$f" ] && inv_add claude-subagent "$cwd" "$f"
      done < <(find "$project_dir" -maxdepth 3 \( -type f -o -type l \) -path "*/subagents/*.jsonl" 2>/dev/null)
    fi
  done
}

collect_codex() {
  [ -d "$CODEX_DIR" ] || return 0
  local f cwd
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    cwd=$(first_cwd_in_jsonl "$f")
    [ -z "$cwd" ] && cwd="codex (cwd unresolved)"
    inv_add codex "$cwd" "$f"
  done < <(find "$CODEX_DIR" -maxdepth 6 \( -type f -o -type l \) -name "*.jsonl" 2>/dev/null)
}

collect_cursor_db() {
  ensure_extract || return 0
  local seen_file="$EXTRACT_DIR/cursor-seen" db ws_dir ws_default f cwd
  : > "$seen_file"
  # Per-workspace DBs first: they win the per-session-id dedupe over the
  # global DB (mirrors Paxel).
  if [ -d "$CURSOR_DIR" ]; then
    for ws_dir in "$CURSOR_DIR"/*/; do
      db="${ws_dir%/}/state.vscdb"
      [ -f "$db" ] || continue
      ws_default=$(get_cursor_workspace_path "${ws_dir%/}")
      ws_default=$(_cursor_urldecode "$ws_default")
      case "$ws_default" in /[A-Za-z]:/*) ws_default="${ws_default#/}" ;; esac
      while IFS=$'\t' read -r f cwd _epoch; do
        [ -n "$f" ] || continue
        [ -z "$cwd" ] && cwd="cursor (workspace unresolved)"
        inv_add cursor "$cwd" "$f"
      done < <(python3 "$EXTRACT_PY" cursor "$db" "$EXTRACT_DIR/cursor" "$ws_default" "$seen_file" 2>/dev/null || true)
    done
  fi
  if [ -f "$CURSOR_GLOBAL_DB" ]; then
    while IFS=$'\t' read -r f cwd _epoch; do
      [ -n "$f" ] || continue
      [ -z "$cwd" ] && cwd="cursor (workspace unresolved)"
      inv_add cursor "$cwd" "$f"
    done < <(python3 "$EXTRACT_PY" cursor "$CURSOR_GLOBAL_DB" "$EXTRACT_DIR/cursor-global" "" "$seen_file" 2>/dev/null || true)
  fi
}

collect_cursor() {
  [ -d "$CURSOR_PROJECTS_DIR" ] || return 0
  local proj_dir at_dir enc ws f sid pd nested
  local seen_file="$EXTRACT_DIR/cursor-seen"
  for proj_dir in "$CURSOR_PROJECTS_DIR"/*/; do
    [ -d "$proj_dir" ] || continue
    at_dir="${proj_dir%/}/agent-transcripts"
    [ -d "$at_dir" ] || continue
    enc=$(basename "${proj_dir%/}")
    ws=$(cursor_ws_for_dir "$enc")
    # Flat layout (current): agent-transcripts/<session-id>.jsonl
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      sid=$(basename "$f" .jsonl)
      # Background task transcripts (task-*) are agent runs, not
      # user-started conversations - same exclusion as nested subagents/.
      case "$sid" in task-*) echo "  SKIP (cursor background task, not a conversation): $f" >&2; continue ;; esac
      if [ -f "$seen_file" ] && grep -qxF "$sid" "$seen_file" 2>/dev/null; then continue; fi
      inv_add cursor "$ws" "$f"
    done < <(find "$at_dir" -maxdepth 1 \( -type f -o -type l \) -name "*.jsonl" 2>/dev/null)
    # Nested mirror (older): agent-transcripts/<sid>/<sid>.jsonl, self-named
    # only; anything under subagents/ is never a primary session.
    while IFS= read -r nested; do
      [ -n "$nested" ] || continue
      sid=$(basename "$nested" .jsonl)
      pd=$(basename "$(dirname "$nested")")
      [ "$pd" = "$sid" ] || continue
      if [ -f "$seen_file" ] && grep -qxF "$sid" "$seen_file" 2>/dev/null; then continue; fi
      inv_add cursor "$ws" "$nested"
    done < <(find "$at_dir" -mindepth 2 -maxdepth 2 \( -type f -o -type l \) -name "*.jsonl" -not -path "*/subagents/*" 2>/dev/null)
  done
}

collect_opencode() {
  [ -d "$OPENCODE_DIR" ] || return 0
  ensure_extract || return 0
  local db f cwd
  while IFS= read -r db; do
    [ -n "$db" ] || continue
    while IFS=$'\t' read -r f cwd _epoch; do
      [ -n "$f" ] || continue
      case "$f" in '#'*) echo "  $f" >&2; continue ;; esac
      [ -z "$cwd" ] && cwd="opencode (directory unknown)"
      inv_add opencode "$cwd" "$f"
    done < <(python3 "$EXTRACT_PY" opencode "$db" "$EXTRACT_DIR/opencode" 2>/dev/null || true)
  done < <(find "$OPENCODE_DIR" -maxdepth 1 -name "opencode*.db" 2>/dev/null || true)
}

collect_gemini() {
  [ -d "$GEMINI_DIR" ] || return 0
  local slug_dir root f
  for slug_dir in "$GEMINI_DIR"/*/; do
    [ -d "$slug_dir" ] || continue
    root=$(head -1 "${slug_dir%/}/.project_root" 2>/dev/null || true)
    root="${root%$'\r'}"   # CRLF-edited .project_root
    [ -z "$root" ] && root="$(basename "${slug_dir%/}") (root unresolved)"
    while IFS= read -r f; do
      [ -n "$f" ] && inv_add gemini "$root" "$f"
    done < <(find "${slug_dir%/}/chats" -maxdepth 1 \( -type f -o -type l \) -name "session-*.jsonl" 2>/dev/null)
  done
}

collect_antigravity() {
  local surface f uuid db cwd
  for surface in antigravity antigravity-ide antigravity-cli; do
    [ -d "$ANTIGRAVITY_DIR/$surface/brain" ] || continue
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      # Attribution so project select/deny reaches these sessions: the
      # sibling conversations DB first, then the transcript's own tool args
      # (mirrors Paxel). Unresolved sessions keep the surface label.
      uuid=$(basename "$(dirname "$(dirname "$(dirname "$f")")")")
      db="$ANTIGRAVITY_DIR/$surface/conversations/${uuid}.db"
      cwd=""
      if ensure_extract; then
        cwd=$(python3 "$EXTRACT_PY" antigravity-attr "$db" "$f" 2>/dev/null || true)
      fi
      [ -z "$cwd" ] && cwd="antigravity-$surface"
      inv_add "antigravity" "$cwd" "$f"
    done < <(find "$ANTIGRAVITY_DIR/$surface/brain" -maxdepth 4 \( -type f -o -type l \) -path "*/.system_generated/logs/transcript.jsonl" 2>/dev/null)
  done
}

collect_vscode() {
  local base f ws
  while IFS= read -r base; do
    [ -d "$base" ] || continue
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      ws=""
      [ -f "$(dirname "$(dirname "$f")")/workspace.json" ] && ws=$(first_cwd_in_jsonl "$(dirname "$(dirname "$f")")/workspace.json" folder)
      [ -z "$ws" ] && ws="vscode-workspace-$(basename "$(dirname "$(dirname "$f")")")"
      inv_add vscode "$ws" "$f"
    done < <(find "$base" -maxdepth 3 \( -type f -o -type l \) -path "*/chatSessions/*.json" 2>/dev/null)
  done < <(printf '%s\n' "$VSCODE_DIRS")
}

pi_session_header() {  # first line is a real top-level Pi session header.
  # Pi writes compact JSON with "type" first; the anchored prefix rejects
  # nested look-alikes such as {"outer":{"type":"session"},...}, and a full
  # JSON parse confirms top-level type when python3 is available.
  local f="$1" first=""
  [ -f "$f" ] || return 1
  IFS= read -r first < "$f" 2>/dev/null || return 1
  case "$first" in '{"type":"session"'*) ;; *) return 1 ;; esac
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys
try: obj=json.loads(sys.argv[1])
except ValueError: sys.exit(1)
sys.exit(0 if isinstance(obj,dict) and obj.get("type")=="session" else 1)' "$first" || return 1
  fi
  return 0
}

collect_pi() {
  local f cwd
  # Current layout: sessions/--<encoded-cwd>--/<timestamp>_<id>.jsonl. Depth 2
  # also catches JSONLs placed directly in the sessions dir.
  if [ -d "$PI_DIR" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      pi_session_header "$f" || continue
      cwd=$(first_cwd_in_jsonl "$f")
      [ -z "$cwd" ] && cwd="pi (cwd unresolved)"
      inv_add pi "$cwd" "$f"
    done < <(find "$PI_DIR" -maxdepth 2 \( -type f -o -type l \) -name "*.jsonl" 2>/dev/null)
  fi
  # Legacy flat layout (v0.30.0 bug): session JSONLs directly in the agent
  # dir. This root also holds Pi's settings/models/auth files, so only files
  # whose first line declares a Pi session header are collected.
  if [ -d "$PI_AGENT_DIR" ] && [ "$PI_AGENT_DIR" != "$PI_DIR" ]; then
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      pi_session_header "$f" || continue
      cwd=$(first_cwd_in_jsonl "$f")
      [ -z "$cwd" ] && cwd="pi (cwd unresolved)"
      inv_add pi "$cwd" "$f"
    done < <(find "$PI_AGENT_DIR" -maxdepth 1 \( -type f -o -type l \) -name "*.jsonl" 2>/dev/null)
  fi
}

build_inventory() {
  : > "$INVENTORY"
  want_tool claude      && collect_claude
  want_tool codex       && collect_codex
  want_tool cursor      && { collect_cursor_db; collect_cursor; }
  want_tool opencode    && collect_opencode
  want_tool gemini      && collect_gemini
  want_tool antigravity && collect_antigravity
  want_tool vscode      && collect_vscode
  want_tool pi          && collect_pi
}

# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------
do_list() {
  build_inventory
  if [ ! -s "$INVENTORY" ]; then
    echo "No sessions found in the known stores."
  else
    echo "Discovered sessions (nothing copied). Select with --project TOKEN:"
    echo
    awk -F'\t' '{ key=$1"\t"$2; files[key]++; bytes[key]+=1 }
      END { for (k in files) print k }' "$INVENTORY" | sort | while IFS=$'\t' read -r tool label; do
      n=$(awk -F'\t' -v t="$tool" -v l="$label" '$1==t && $2==l {c++} END {print c}' "$INVENTORY")
      b=$(awk -F'\t' -v t="$tool" -v l="$label" '$1==t && $2==l {print $4}' "$INVENTORY" | while read -r p; do size_of "$p"; done | awk '{s+=$1} END {print s}')
      printf '  %-16s %-50s %5s files %10s bytes\n' "$tool" "$label" "$n" "$b"
    done
    echo
    echo "Total: $(wc -l < "$INVENTORY" | tr -d ' ') session files"
  fi
}

token_matches_line() {  # token_matches_line <token> <tool> <label> <cwd>
  local token="$1" tool="$2" label="$3" cwd="$4"
  local t_tool="" t_text="$token"
  case "$token" in
    *:*) t_tool="${token%%:*}"; t_text="${token#*:}" ;;
  esac
  [ -n "$t_tool" ] && [ "$t_tool" != "$tool" ] && return 1
  local hay needle
  hay=$(printf '%s\n%s\n%s' "$label" "$cwd" "$(slugify "$label")" | tr 'A-Z' 'a-z')
  needle=$(printf '%s' "$t_text" | tr 'A-Z' 'a-z')
  printf '%s' "$hay" | grep -qF -- "$needle" 2>/dev/null
}

do_export() {
  [ -z "$OUT_DIR" ] && { echo "Refusing: --export requires --out DIR." >&2; exit 1; }
  if [ -e "$OUT_DIR" ] && [ -n "$(ls -A "$OUT_DIR" 2>/dev/null)" ] && [ "${FORCE_OUT:-0}" -eq 0 ]; then
    echo "Refusing: output dir '$OUT_DIR' is not empty; stale files could leak into a later send." >&2
    echo "Use a fresh directory (or --force to reuse)." >&2
    exit 1
  fi

  build_inventory

  # Guard: output must not sit inside a session store we read from
  local resolved_out
  resolved_out=$(cd "$(dirname "$OUT_DIR")" 2>/dev/null && pwd -P)/$(basename "$OUT_DIR")
  for root in "$CLAUDE_DIR" "$CODEX_DIR" "$CURSOR_PROJECTS_DIR" "$GEMINI_DIR" "$PI_DIR" "$PI_AGENT_DIR"; do
    case "$resolved_out" in
      "$root"*|"$root"/*) echo "Refusing: --out must not be inside a session store ($root)." >&2; exit 1 ;;
    esac
  done

  SELECTED=$(mktemp "${TMPDIR:-/tmp}/session-selected.XXXXXX")
  : > "$SELECTED"

  # Apply --project tokens against the inventory
  local token matched
  printf '%s' "$PROJECT_TOKENS" | while IFS= read -r token; do
    [ -z "$token" ] && continue
    matched=0
    while IFS=$'\t' read -r tool label cwd src; do
      if token_matches_line "$token" "$tool" "$label" "$cwd"; then
        printf '%s\t%s\t%s\t%s\n' "$tool" "$label" "$cwd" "$src" >> "$SELECTED"
        matched=1
      fi
    done < "$INVENTORY"
    [ "$matched" -eq 0 ] && echo "NO-MATCH:$token" >> "$SELECTED.bad"
  done
  if [ -f "$SELECTED.bad" ]; then
    echo "Refusing: these --project tokens matched nothing:" >&2
    sed 's/^NO-MATCH:/  /' "$SELECTED.bad" >&2
    rm -f "$SELECTED.bad"
    exit 1
  fi

  # Bulk default: no explicit selection -> up to RECENT_N most recent
  # CONVERSATIONS across all tools, not files. A conversation is one
  # user-started thread: records are grouped by the thread ids the tools
  # write (Codex session_id / Claude sessionId / VS Code sessionId); Codex
  # forks/continuations join their recorded root thread when the lineage
  # and the root are both present. Ranking is by each conversation's
  # latest activity (newest timestamp in its files; mtime fallback is
  # reported). Empty captures and automated approval checks (Codex
  # guardian reviews) are excluded, not counted. Files in formats with no
  # recognizable human turn are reported as unclassified, not counted as
  # conversations. Subagent runs attach to their root conversation as
  # context and never consume the conversation budget. Grouping is per
  # tool: the same conversation captured by two tools may count
  # separately, and that ambiguity is reported, not hidden.
  if [ -z "$PROJECT_TOKENS" ] && [ -z "$SESSIONS_FILE" ]; then
    echo "Bulk mode: exporting up to $RECENT_N most recent conversations across all tools (cap 50 conversations; no unlimited mode)."
    local ranked rawrank rec basis mt_fallback=0 convpy report_json
    ranked=$(mktemp "${TMPDIR:-/tmp}/session-ranked.XXXXXX")
    rawrank=$(mktemp "${TMPDIR:-/tmp}/session-rawrank.XXXXXX")
    while IFS=$'\t' read -r tool label cwd src; do
      case "$tool" in *subagent*) continue ;; esac
      rec=$(session_recency "$src")
      basis=${rec##* }
      [ "$basis" = "mtime" ] && mt_fallback=$((mt_fallback + 1))
      printf '%s\t%s\t%s\t%s\t%s\t%s\n' "${rec% *}" "$basis" "$tool" "$label" "$cwd" "$src"
    done < "$INVENTORY" > "$rawrank"
    if command -v python3 >/dev/null 2>&1; then
      report_json=$(mktemp "${TMPDIR:-/tmp}/session-report.XXXXXX")
      convpy=$(mktemp "${TMPDIR:-/tmp}/session-convselect.XXXXXX.py")
      cat > "$convpy" <<'CONVPY'
import json, os, sys
# Conversation-aware bulk selection for Reckon intake.
# Reads ranked TSV rows: epoch \t basis \t tool \t label \t cwd \t src
# Writes selected rows: tool \t label \t cwd \t src \t conv_id \t role
# A "conversation" is one user-started thread. Files that only record
# automated approval checks or hold no genuine human input are excluded;
# files in a format with no recognizable human turn (Antigravity, or an
# unrecognized layout) are unclassified and excluded; subagent runs attach
# to their root conversation as context, not slots. Codex
# forks/continuations join their recorded root thread.
INJECT_PREFIXES = ('# AGENTS.md instructions', '<environment_context', '<external_',
                   '<user_instructions', '<local-command', '<command-name', '<command-message',
                   '<system-reminder', 'Caveat:')
MAX_RECORDS = 240
MAX_BYTES = 512 * 1024**2

def genuine_text(t):
    t = (t or '').strip()
    if not t:
        return False
    return not t.startswith(INJECT_PREFIXES)

def scan_jsonl(path, want_meta):
    meta, genuine = {}, False
    with open(path, errors='replace') as fh:
        first = True
        for line in fh:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if not isinstance(obj, dict):
                continue
            if genuine and not (first and want_meta == 'codex'):
                break
            if first and want_meta == 'codex':
                p = obj.get('payload') if isinstance(obj.get('payload'), dict) else obj
                for k in ('id', 'session_id', 'parent_thread_id', 'thread_source'):
                    if isinstance(p.get(k), str):
                        meta[k] = p[k]
            first = False
            if want_meta == 'codex':
                p = obj.get('payload') if isinstance(obj.get('payload'), dict) else obj
                if p.get('type') == 'message' and p.get('role') == 'user':
                    c = p.get('content')
                    texts = []
                    if isinstance(c, list):
                        texts = [x.get('text', '') for x in c if isinstance(x, dict) and x.get('type') == 'input_text']
                    elif isinstance(c, str):
                        texts = [c]
                    if any(genuine_text(t) for t in texts):
                        genuine = True
            else:
                if isinstance(obj.get('sessionId'), str):
                    meta.setdefault('sessionId', obj['sessionId'])
                if obj.get('type') == 'user':
                    c = (obj.get('message') or {}).get('content')
                    if isinstance(c, str) and genuine_text(c):
                        genuine = True
                    elif isinstance(c, list):
                        if any(isinstance(x, dict) and x.get('type') == 'text' and genuine_text(str(x.get('text', ''))) for x in c):
                            genuine = True
    return meta, genuine

def scan_vscode(path):
    try:
        obj = json.load(open(path, errors='replace'))
    except ValueError:
        return {}, os.path.getsize(path) > 0
    meta = {'sessionId': obj.get('sessionId')} if isinstance(obj.get('sessionId'), str) else {}
    reqs = obj.get('requests')
    genuine = False
    if isinstance(reqs, list):
        for r in reqs:
            if isinstance(r, dict) and genuine_text(str((r.get('message') or {}).get('text', ''))):
                genuine = True
                break
    return meta, genuine

def _texts_from(obj):
    texts = []
    for holder in (obj, obj.get('message') if isinstance(obj.get('message'), dict) else {}):
        t = holder.get('text')
        if isinstance(t, str):
            texts.append(t)
        c = holder.get('content')
        if isinstance(c, str):
            texts.append(c)
        elif isinstance(c, list):
            # text parts, including bare {"text": ...} records (Gemini).
            texts += [str(x.get('text', '')) for x in c
                      if isinstance(x, dict) and isinstance(x.get('text'), str)
                      and x.get('type') in (None, 'text')]
    return texts

def human_signal(obj):
    # Positive evidence of a genuine human turn in a JSONL record, using
    # only widely used role markers. Cursor's composer bubbles encode
    # assistant as type 2 (see the extractor), so type 1 marks a user turn.
    role = obj.get('role') or obj.get('type')
    msg = obj.get('message') if isinstance(obj.get('message'), dict) else {}
    mrole = msg.get('role')
    if not (role in ('user', 'human') or mrole in ('user', 'human') or role in (1, '1')):
        return False
    return any(genuine_text(t) for t in _texts_from(obj))

def cursor_genuine(path):
    # True: genuine human turn found. False: known format, no genuine human
    # turn. None: format not recognized -> unclassified, not a conversation.
    try:
        fh = open(path, errors='replace')
    except OSError:
        return None
    with fh:
        first = fh.readline()
        try:
            obj = json.loads(first)
        except ValueError:
            obj = None
        if isinstance(obj, dict) and obj.get('type') == '_cursor_meta':
            # Reckon's own Cursor DB extract: user bubbles carry text parts;
            # tool results are emitted as 'tool_result' and never qualify.
            for line in fh:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, dict) and obj.get('type') == 'user'                         and any(genuine_text(t) for t in _texts_from(obj)):
                    return True
            return False
        # Cursor's own agent-transcripts format: accept only positive
        # human-turn signals; anything else is unclassified.
        fh.seek(0)
        for line in fh:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if isinstance(obj, dict) and human_signal(obj):
                return True
        return None

def opencode_genuine(path):
    # Same contract as cursor_genuine, for Reckon's opencode DB extract:
    # message lines carry the session_message object plus its text parts.
    try:
        fh = open(path, errors='replace')
    except OSError:
        return None
    with fh:
        first = fh.readline()
        try:
            obj = json.loads(first)
        except ValueError:
            return None
        if not (isinstance(obj, dict) and obj.get('type') == 'opencode_session_meta'):
            return None
        saw_msg = saw_role = False
        for line in fh:
            try:
                o = json.loads(line)
            except ValueError:
                continue
            if not (isinstance(o, dict) and o.get('type') == 'opencode_message'):
                continue
            saw_msg = True
            m = o.get('message') if isinstance(o.get('message'), dict) else {}
            role = m.get('role')
            if role is not None:
                saw_role = True
            if role != 'user':
                continue
            texts = _texts_from(m)
            for part in o.get('parts') or []:
                p = part.get('p') if isinstance(part, dict) and isinstance(part.get('p'), dict) else part
                if isinstance(p, dict) and p.get('type') == 'text' and isinstance(p.get('text'), str):
                    texts.append(p['text'])
            if any(genuine_text(t) for t in texts):
                return True
        if not saw_msg or not saw_role:
            return None
        return False

def pi_genuine(path):
    # Pi sessions: first line {"type":"session",...} is enforced at
    # collection, so the format is exact: message lines carry
    # {"type":"message","message":{"role":...}}. Only a user-role message
    # with genuine text qualifies; system/toolResult/custom never do.
    try:
        fh = open(path, errors='replace')
    except OSError:
        return None
    with fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if not isinstance(obj, dict) or obj.get('type') != 'message':
                continue
            m = obj.get('message') if isinstance(obj.get('message'), dict) else {}
            if m.get('role') == 'user' and any(genuine_text(t) for t in _texts_from(obj)):
                return True
    return False

def gemini_genuine(path):
    # Gemini CLI session-*.jsonl: one record per line, user turns carry
    # type:"user" with content (string or {"text":...} parts). Qualify on
    # that positive signal only; anything else stays unclassified.
    try:
        fh = open(path, errors='replace')
    except OSError:
        return None
    with fh:
        for line in fh:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if isinstance(obj, dict) and obj.get('type') == 'user' \
                    and any(genuine_text(t) for t in _texts_from(obj)):
                return True
    return None

def classify(tool, src):
    if tool == 'codex':
        meta, genuine = scan_jsonl(src, 'codex')
        conv = meta.get('session_id') or meta.get('id') or src
        tsrc = meta.get('thread_source')
        if tsrc == 'guardian_review':
            role = 'automated'
        elif tsrc == 'subagent' or tool.endswith('subagent'):
            role = 'context'
        else:
            role = 'primary'
        return conv, role, genuine, meta.get('parent_thread_id')
    if tool.endswith('subagent'):
        meta, genuine = scan_jsonl(src, 'claude')
        return meta.get('sessionId') or src, 'context', genuine, None
    if tool == 'claude':
        meta, genuine = scan_jsonl(src, 'claude')
        return meta.get('sessionId') or src, 'primary', genuine, None
    if tool == 'vscode':
        meta, genuine = scan_vscode(src)
        return meta.get('sessionId') or src, 'primary', genuine, None
    if tool == 'cursor':
        return src, 'primary', cursor_genuine(src), None
    if tool == 'opencode':
        return src, 'primary', opencode_genuine(src), None
    if tool == 'pi':
        return src, 'primary', pi_genuine(src), None
    if tool == 'gemini':
        return src, 'primary', gemini_genuine(src), None
    # Other adapters (Antigravity) have no genuine-human check for their
    # format: a non-empty file alone does not qualify as a user conversation.
    return src, 'primary', None, None

def main():
    ranked_path, out_path, report_path, recent_n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    rows = []
    with open(ranked_path) as fh:
        for line in fh:
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 6:
                continue
            epoch, basis, tool, label, cwd, src = parts
            rows.append({'epoch': int(epoch), 'basis': basis, 'tool': tool, 'label': label, 'cwd': cwd, 'src': src})
    excluded_automated = excluded_empty = excluded_unclassified = 0
    excluded_by_tool = {}
    convs = {}
    lineage = {}  # Codex thread id -> recorded parent thread id
    for r in rows:
        conv, role, genuine, parent = classify(r['tool'], r['src'])
        r.update(conv=conv, role=role, genuine=genuine, size=os.path.getsize(r['src']))
        if r['tool'] == 'codex' and isinstance(parent, str) and parent and parent != conv:
            lineage[conv] = parent
        if role == 'automated':
            excluded_automated += 1
            excluded_by_tool.setdefault(r['tool'], [0, 0, 0])[0] += 1
            continue
        if role == 'primary' and genuine is False:
            # Empty capture (no genuine human input). Excluded even when a
            # sibling capture of the same conversation does qualify.
            excluded_empty += 1
            excluded_by_tool.setdefault(r['tool'], [0, 0, 0])[1] += 1
            continue
        if role == 'primary' and genuine is None:
            # Format carries no recognizable human turn: reported, not
            # counted as a user conversation.
            excluded_unclassified += 1
            excluded_by_tool.setdefault(r['tool'], [0, 0, 0])[2] += 1
            continue
        convs.setdefault((r['tool'], conv), []).append(r)
    # Forks/continuations join their recorded root thread. Conservative:
    # only explicit lineage captured above is followed, walking stops at an
    # unknown parent or a cycle, and nothing merges across tools.
    def resolve_root(conv):
        seen = set()
        cur = conv
        while cur in lineage and cur not in seen:
            seen.add(cur)
            cur = lineage[cur]
        return cur
    if lineage:
        regrouped = {}
        for (tool, conv), files in convs.items():
            key = (tool, resolve_root(conv)) if tool == 'codex' else (tool, conv)
            regrouped.setdefault(key, []).extend(files)
        convs = regrouped
    # Rank conversations by newest genuine primary file.
    def conv_recency(files):
        return max((f['epoch'] for f in files if f['role'] == 'primary'), default=0)
    ordered = sorted(convs.items(), key=lambda kv: conv_recency(kv[1]), reverse=True)
    # A group with no qualifying primary file is not a conversation: its
    # attached runs are left out and reported, not given a slot.
    eligible = [kv for kv in ordered if any(f['role'] == 'primary' for f in kv[1])]
    context_only_dropped = len(ordered) - len(eligible)
    selected = eligible[:recent_n]
    selected_ids = {k for k, _ in selected}
    out_rows, total_bytes = [], 0
    context_dropped = 0
    for (tool, conv), files in selected:
        for f in files:
            f['group'] = conv
        primaries = sorted((f for f in files if f['role'] == 'primary'), key=lambda f: f['epoch'], reverse=True)
        context = sorted((f for f in files if f['role'] == 'context'), key=lambda f: f['epoch'], reverse=True)
        for f in primaries:
            out_rows.append(f)
            total_bytes += f['size']
        for f in context:
            if len(out_rows) >= MAX_RECORDS or total_bytes + f['size'] > MAX_BYTES:
                context_dropped += 1
                continue
            out_rows.append(f)
            total_bytes += f['size']
    with open(out_path, 'w') as out:
        for f in out_rows:
            # conversation = canonical root thread id (group); thread = the
            # file's own recorded thread id when it differs (fork/duplicate).
            out.write('\t'.join([f['tool'], f['label'], f['cwd'], f['src'], f['group'], f['role'], f['conv']]) + '\n')
    multi_tool_labels = {}
    for (tool, conv), files in selected:
        multi_tool_labels.setdefault(files[0]['label'], set()).add(tool)
    notes = []
    if any(len(t) > 1 for t in multi_tool_labels.values()):
        notes.append('one project label appears under more than one tool; per-tool records are grouped separately and may be the same conversation captured twice')
    notes.append('forks and continuations join their root conversation when the tool records the lineage and the root was captured; otherwise they count as their own conversation')
    report = {
        'conversations': len(selected),
        'qualified_total': len(eligible),
        'primary_files': sum(1 for f in out_rows if f['role'] == 'primary'),
        'context_files': sum(1 for f in out_rows if f['role'] == 'context'),
        'excluded_automated_checks': excluded_automated,
        'excluded_empty_captures': excluded_empty,
        'excluded_unclassified': excluded_unclassified,
        'excluded_by_tool': {t: {'automated': v[0], 'empty': v[1], 'unclassified': v[2]}
                             for t, v in sorted(excluded_by_tool.items())},
        'context_only_threads_dropped': context_only_dropped,
        'context_dropped_for_budget': context_dropped,
        'total_bytes': total_bytes,
        'notes': notes,
    }
    with open(report_path, 'w') as fh:
        json.dump(report, fh, indent=1)
    print('  conversations selected: %d (%d qualified non-empty user conversations found; cap %d)' % (len(selected), len(eligible), recent_n), file=sys.stderr)
    print('  files: %d primary + %d attached subagent context' % (report['primary_files'], report['context_files']), file=sys.stderr)
    print('  excluded: %d automated approval checks, %d empty captures, %d unclassified (no recognizable human turn)' % (excluded_automated, excluded_empty, excluded_unclassified), file=sys.stderr)
    for t, v in sorted(excluded_by_tool.items()):
        print('    %s: %d automated, %d empty, %d unclassified' % (t, v[0], v[1], v[2]), file=sys.stderr)
    if context_only_dropped:
        print('  note: %d attached run(s) left out because their root conversation was not captured or did not qualify' % context_only_dropped, file=sys.stderr)
    if context_dropped:
        print('  note: %d context file(s) left out to stay inside archive limits' % context_dropped, file=sys.stderr)
    for n in notes:
        print('  note: ' + n, file=sys.stderr)

main()
CONVPY
      python3 "$convpy" "$rawrank" "$ranked" "$report_json" "$RECENT_N"
      conv_rc=$?
      rm -f "$convpy"
      if [ "$conv_rc" -ne 0 ]; then
        echo "Refusing: conversation grouping failed; nothing was exported." >&2
        rm -f "$rawrank" "$ranked" "$report_json"
        exit 1
      fi
      cat "$ranked" >> "$SELECTED"
      cp "$report_json" "${SELECTED}.convreport"
      rm -f "$ranked" "$report_json"
    else
      echo "  Note: python3 unavailable; falling back to newest-$RECENT_N files (no conversation grouping, no empty/automated exclusion)."
      sort -t$'\t' -k1,1nr "$rawrank" | head -n "$RECENT_N" | cut -f3- > "$ranked"
      cat "$ranked" >> "$SELECTED"
      rm -f "$ranked"
    fi
    rm -f "$rawrank"
    if [ "$INCLUDE_SUBAGENTS" -eq 1 ]; then
      echo "  Claude subagent transcripts only join explicit project selections via --include-subagents."
    fi
    echo "  ranked by latest activity in each conversation ($mt_fallback file(s) had no usable timestamp and used file modification time)."
  fi

  # Apply --sessions-file (explicit absolute paths under a known store)
  if [ -n "$SESSIONS_FILE" ]; then
    [ -f "$SESSIONS_FILE" ] || { echo "Refusing: sessions file not found: $SESSIONS_FILE" >&2; exit 1; }
    local line bad=0
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in \#*) continue ;; esac
      if [ -L "$line" ]; then echo "Refusing: symlink not accepted: $line" >&2; bad=1; continue; fi
      if [ ! -f "$line" ]; then echo "Refusing: not a regular file: $line" >&2; bad=1; continue; fi
      if path_denied "$line"; then echo "Refusing: denylisted path: $line" >&2; bad=1; continue; fi
      local selected_row
      selected_row=$(awk -F'\t' -v p="$line" '$4==p {print;exit}' "$INVENTORY")
      if [ -z "$selected_row" ]; then
        echo "Refusing: session is excluded or not eligible in discovery: $line" >&2
        bad=1; continue
      fi
      printf '%s\n' "$selected_row" >> "$SELECTED"
    done < "$SESSIONS_FILE"
    [ "$bad" -eq 1 ] && { rm -f "$SELECTED"; exit 1; }
  fi

  # Deduplicate by source path
  sort -t$'\t' -k4 -u "$SELECTED" -o "$SELECTED"

  local primary_count
  primary_count=$(awk -F'\t' '$1 !~ /subagent/ && (NF < 6 || $6 == "primary") { k = (NF >= 5 && $5 != "") ? $5 : $4; seen[k] = 1 } END { n = 0; for (k in seen) n++; print n }' "$SELECTED")
  if [ "$primary_count" -gt "$RECENT_N" ]; then
    echo "Refusing: selection has $primary_count primary conversations; maximum is $RECENT_N. Narrow it or use bulk mode." >&2
    exit 1
  fi

  if [ ! -s "$SELECTED" ]; then
    echo "Nothing selected; nothing copied." >&2
    exit 1
  fi

  echo "Selected $(wc -l < "$SELECTED" | tr -d ' ') files:"
  awk -F'\t' '{printf "  [%s] %s  (%s)\n", $1, $4, $2}' "$SELECTED"
  echo

  mkdir -p "$OUT_DIR"
  local MANIFEST="$OUT_DIR/manifest.jsonl"
  : > "$MANIFEST"
  local total_files=0 total_bytes=0
  local tool label cwd src conv_id conv_role own_thread bucket dest bytes mt sha remote project_name
  while IFS=$'\t' read -r tool label cwd src conv_id conv_role own_thread; do
    bucket="${tool}/$(slugify "$label")_$(stable_hash6 "$label")"
    dest="$OUT_DIR/$bucket/$(basename "$src")"
    mkdir -p "$OUT_DIR/$bucket"
    # Name collisions (e.g. Antigravity's per-conversation transcript.jsonl)
    # must not overwrite: disambiguate with a hash of the source path.
    if [ -e "$dest" ] && ! cmp -s "$src" "$dest" 2>/dev/null; then
      dest="$OUT_DIR/$bucket/$(stable_hash6 "$src")-$(basename "$src")"
    fi
    if ! cp -p "$src" "$dest"; then
      echo "  WARN: copy failed: $src" >&2; continue
    fi
    bytes=$(size_of "$src"); mt=$(mtime_of "$src"); sha=$(sha256_of "$dest")
    remote=$(get_git_remote "$cwd")
    project_name="${label%/}"; project_name="${project_name##*/}"
    if command -v jq >/dev/null 2>&1; then
      jq -nc --arg tool "$tool" --arg project "$project_name" \
         --arg cwd "$cwd" --arg remote "$remote" \
         --arg src "$src" --arg dest "${dest#"$OUT_DIR"/}" \
         --arg conv "$conv_id" --arg role "$conv_role" --arg thr "$own_thread" \
         --argjson bytes "$bytes" --argjson mtime "$mt" --arg sha256 "$sha" \
         '({tool:$tool, project:$project, cwd:$cwd, git_remote:$remote, source:$src, file:$dest, bytes:$bytes, mtime:$mtime, sha256:$sha256}
           + (if $conv == "" then {} else {conversation:$conv} end)
           + (if $role == "" then {} else {role:$role} end)
           + (if $thr == "" or $thr == $conv then {} else {thread:$thr} end))' \
         >> "$MANIFEST" || { echo "  WARN: manifest write failed for $src" >&2; rm -f "$dest"; continue; }
    else
      esc() { printf '%s' "$1" | sed 's#\\#\\\\#g; s#"#\\"#g'; }
      local extra=""
      [ -n "$conv_id" ] && extra="$extra,\"conversation\":\"$(esc "$conv_id")\""
      [ -n "$conv_role" ] && extra="$extra,\"role\":\"$(esc "$conv_role")\""
      [ -n "$own_thread" ] && [ "$own_thread" != "$conv_id" ] && extra="$extra,\"thread\":\"$(esc "$own_thread")\""
      printf '{"tool":"%s","cwd":"%s","source":"%s","file":"%s","bytes":%s,"mtime":%s,"sha256":"%s"%s}\n' \
        "$(esc "$tool")" "$(esc "$cwd")" "$(esc "$src")" "$(esc "${dest#"$OUT_DIR"/}")" "$bytes" "$mt" "$sha" "$extra" >> "$MANIFEST" \
        || { echo "  WARN: manifest write failed for $src" >&2; rm -f "$dest"; continue; }
    fi
    total_files=$((total_files + 1)); total_bytes=$((total_bytes + bytes))
  done < "$SELECTED"

  {
    echo "coding-sessions export"
    echo "created: $(date)"
    echo "files: $total_files"
    echo "bytes: $total_bytes"
    if [ -f "${SELECTED}.convreport" ] && command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys
r=json.load(open(sys.argv[1]))
print("conversations: %d of %d qualified (cap applies to conversations, not files)" % (r["conversations"], r["qualified_total"]))
print("primary files: %d   attached subagent context files: %d" % (r["primary_files"], r["context_files"]))
print("excluded: %d automated approval checks, %d empty captures, %d unclassified (no recognizable human turn)" % (r["excluded_automated_checks"], r["excluded_empty_captures"], r.get("excluded_unclassified", 0)))
for t, v in r.get("excluded_by_tool", {}).items(): print("  %s: %d automated, %d empty, %d unclassified" % (t, v["automated"], v["empty"], v["unclassified"]))
if r.get("context_only_threads_dropped"): print("attached runs left out (root conversation not captured or not qualified): %d" % r["context_only_threads_dropped"])
if r["context_dropped_for_budget"]: print("context files left out for archive limits: %d" % r["context_dropped_for_budget"])
for n in r["notes"]: print("note: "+n)' "${SELECTED}.convreport"
    fi
    echo
    echo "Per-bucket file counts:"
    find "$OUT_DIR" -mindepth 2 -maxdepth 2 -type d | while IFS= read -r d; do
      printf '  %-40s %s files\n' "${d#"$OUT_DIR"/}" "$(find "$d" -type f | wc -l | tr -d ' ')"
    done
  } > "$OUT_DIR/summary.txt"

  cat > "$OUT_DIR/README-FIRST.txt" <<'README'
THIS EXPORT IS PRIVATE RAW DATA.

These are unredacted AI coding-session transcripts. They can contain
secrets, API keys, personal information, client/company names, private
URLs, and other people's data. Copying them changed nothing about that.

Before ANY of this leaves your machine:
  1. Run: ./export-coding-sessions.sh --scan <this directory>
     and open every file it lists.
  2. Also read a sample of sessions by hand -- the scan is a review aid,
     not a guarantee, and it cannot see every kind of sensitive content.
     NOTHING in the tooling removes sensitive content for you.
  3. Delete or hand-redact anything you would not want the recipient
     (or the public) to keep forever. This includes anything about other
     people who never agreed to share their words.
  4. Only use collect.sh or upload-archive.py if you already agreed with
     the collector to share these sessions; consent is handled separately.

If a friend shared this script with you: run it on YOUR OWN machine.
Your sessions are yours; review them yourself.
README

  echo "Done: $total_files files, $total_bytes bytes -> $OUT_DIR"
  echo "Manifest: $MANIFEST"
  echo "Next: review on disk, then ./export-coding-sessions.sh --scan '$OUT_DIR'"
}

do_scan() {
  local dir="$1"
  [ -d "$dir" ] || { echo "Not a directory: $dir" >&2; exit 1; }
  echo "Scan report (review aid only -- nothing was changed):"
  local patterns='re_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{35}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}'
  grep -rEl "$patterns" "$dir" 2>/dev/null | while IFS= read -r hit; do
    local n
    n=$(grep -oE "$patterns" "$hit" 2>/dev/null | wc -l | tr -d ' ')
    echo "  REVIEW: $hit ($n candidate strings: tokens/keys/emails)"
  done
  echo "  Any file listed above needs a human read before sharing. Absence of a"
  echo "  listing is NOT proof the export is clean -- read samples by hand too."
}

case "$MODE" in
 list) do_list ;;
 export) do_export ;;
 scan) do_scan "$DO_SCAN_DIR" ;;
 *) echo "This helper is local-only. Run bash collect.sh to collect and upload." >&2; exit 2 ;;
esac
