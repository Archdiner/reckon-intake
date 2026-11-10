#!/usr/bin/env bash
# Authenticated one-command bootstrap. Private client code is not publicly served.
set -euo pipefail
umask 077
case "${1:-}" in
 '') ;;
 --export-only) [ "$#" -eq 1 ] || exit 2 ;;
 --resume-export) [ "$#" -eq 2 ] || { echo 'Usage: --resume-export /absolute/saved/export' >&2; exit 2; } ;;
 *) echo 'Options: --export-only or --resume-export /absolute/saved/export' >&2; exit 2 ;;
esac
command -v python3 >/dev/null || { printf '%s\n' 'Python 3 is required. Install Python 3, then run this command again.' >&2; exit 1; }
if [ "${1:-}" = '--resume-export' ]; then
 RESUME_EXPORT=$(python3 -c 'import os,sys;print(os.path.abspath(sys.argv[1]))' "$2")
fi
# Reckon styling: only on an interactive terminal; NO_COLOR or a pipe gets plain text.
B='' D='' Y='' R=''
if [ -t 1 ] && [ "${TERM:-}" != dumb ] && [ -z "${NO_COLOR+x}" ]; then
 case "${COLORTERM:-}" in truecolor|24bit) B=$'\033[1;38;2;20;169;201m' ;; *) B=$'\033[1;38;5;38m' ;; esac
 D=$'\033[2m' Y=$'\033[33m' R=$'\033[0m'
fi
RK_COLS=80; [ -z "$B" ] || RK_COLS=$(stty size 2>/dev/null </dev/tty | cut -d' ' -f2 || true); RK_COLS=${RK_COLS:-80}
if [ -n "$B" ] && [ "$RK_COLS" -ge 56 ]; then
 printf '\n'
 for RK_ROW in \
  '██████╗ ███████╗ ██████╗██╗  ██╗ ██████╗ ███╗   ██╗' \
  '██╔══██╗██╔════╝██╔════╝██║ ██╔╝██╔═══██╗████╗  ██║' \
  '██████╔╝█████╗  ██║     █████╔╝ ██║   ██║██╔██╗ ██║' \
  '██╔══██╗██╔══╝  ██║     ██╔═██╗ ██║   ██║██║╚██╗██║' \
  '██║  ██║███████╗╚██████╗██║  ██╗╚██████╔╝██║ ╚████║' \
  '╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝' \
  ; do printf '  %s%s%s\n' "$B" "$RK_ROW" "$R"; done
 printf '  %s%s%s\n' "$D" 'Session intake · your 50 newest coding conversations' "$R"
else
 printf '%s\n' 'Reckon: session intake, your 50 newest coding conversations'
fi
printf '%s\n' "  ${Y}!${R} Known key-like values are masked in a copy before upload." \
 "    Pattern matching can miss secrets. Originals stay unchanged." \
 "  ${D}By default Reckon uploads to private storage. --export-only keeps everything on this computer.${R}"
export RECKON_BANNER_SHOWN=1
# BROWSER_AUTH_START
if [ -z "${SESSION_UPLOAD_TOKEN:-}" ]; then
 AUTH_RESULT=$(mktemp "${TMPDIR:-/tmp}/reckon-signin.XXXXXXXX")
 rm -f "$AUTH_RESULT"
 trap 'rm -f "$AUTH_RESULT"' EXIT
 python3 - "$AUTH_RESULT" <<'RECKON_AUTH_PY'
#!/usr/bin/env python3
"""Pinned browser authentication helper. No login credential is printed by this module."""
import hashlib,io,json,os,pathlib,platform,re,subprocess,sys,tarfile,tempfile,urllib.request,urllib.error
ORIGIN='https://paxel-intake.aarizvi06.workers.dev'; APP=ORIGIN+'/browser/identity'
VERSION='2026.10.2'
PINS={('Darwin','x86_64'):('cloudflared-darwin-amd64.tgz','4be2a4c0b76f6be4a84bea590743e85041949c294efcee4de86a140a9f11869a'),('Darwin','arm64'):('cloudflared-darwin-arm64.tgz','823f993ef362fba5e0e288db6f3452d8de34291632971c7a40b79548420e9a18'),('Linux','x86_64'):('cloudflared-linux-amd64','35fbdd2beb378436c7da377d7358cea8e33f9c94a6705d1d8036bf9b0d6d8005'),('Linux','aarch64'):('cloudflared-linux-arm64','b7e55b4d9702c2ab5f8348f780bb1db044527fc555367714c78e0595750a4665')}
ARCHIVE_PINS={'cloudflared-darwin-amd64.tgz':'b64efd5a2772fc124b855f60eb3d33ba1a4f2ba67b19ddc58d32b705d42b82c9','cloudflared-darwin-arm64.tgz':'529a07089ac2d46762578389230fa148e5cb6ce2689200fc006956864042d17a'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args):return None

def identity(token,openurl=None):
 if not isinstance(token,str)or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',token)or len(token)>16384:raise ValueError('Invalid browser credential')
 req=urllib.request.Request(APP,headers={'cf-access-token':token,'User-Agent':'PaxelPrivateIntake/1.0'})
 try:
  with (openurl or urllib.request.build_opener(NoRedirect()).open)(req,timeout=30)as r:j=json.loads(r.read(16385))
 except urllib.error.HTTPError as e:raise ValueError('Browser login is expired, revoked, or not allowed; sign in again')from None
 if not re.fullmatch(r'rk_[a-f0-9]{32}',j.get('reckon_id',''))or not isinstance(j.get('email'),str)or '@'not in j['email']:raise ValueError('Browser identity response is not valid')
 return j

def helper(folder,download=None,system=None):
 key=system or (platform.system(),platform.machine())
 if key not in PINS:raise ValueError('Browser login supports macOS and Linux on Intel/Apple Silicon/ARM64. No token or upload was sent')
 name,digest=PINS[key]
 print('  Downloading the pinned browser sign-in helper...',file=sys.stderr,flush=True)
 with (download or urllib.request.urlopen)('https://github.com/cloudflare/cloudflared/releases/download/'+VERSION+'/'+name,timeout=90)as r:data=r.read(64*1024**2+1)
 if len(data)>64*1024**2 or hashlib.sha256(data).hexdigest()!=ARCHIVE_PINS.get(name,digest):raise ValueError('Browser helper checksum mismatch. Nothing executed or uploaded')
 if name.endswith('.tgz'):
  with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz')as archive:
   entries=archive.getmembers();matches=[e for e in entries if e.name in ('cloudflared','./cloudflared')and e.isfile()]
   if len(matches)!=1 or matches[0].size>64*1024**2:raise ValueError('Unexpected browser helper archive')
   data=archive.extractfile(matches[0]).read()
 if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Browser helper binary checksum mismatch. Nothing executed or uploaded')
 path=pathlib.Path(folder)/'cloudflared';path.write_bytes(data);path.chmod(0o700);return path

def login():
 existing=os.environ.get('RECKON_ACCESS_TOKEN')
 if existing:
  try:return existing,identity(existing)
  except ValueError:raise ValueError('The provided RECKON_ACCESS_TOKEN is stale or not allowed. Run unset RECKON_ACCESS_TOKEN, then retry the same command to open browser sign-in')from None
 with tempfile.TemporaryDirectory(prefix='reckon-signin-')as folder:
  binary=helper(folder)
  print('  Opening Reckon browser sign-in. Use your own email and enter the emailed code in your browser.',file=sys.stderr,flush=True)
  # stderr carries only the official browser handoff URL/status. JWT is captured, never echoed.
  try:r=subprocess.run([str(binary),'access','login','--no-verbose',APP],stdout=subprocess.PIPE,text=True,timeout=300,env={**os.environ,'HOME':folder})
  except subprocess.TimeoutExpired:raise ValueError('Browser sign-in timed out. No export uploaded; retry the same command')from None
  if r.returncode:raise ValueError('Browser sign-in was not completed. Nothing uploaded')
  token=r.stdout.strip()
  return token,identity(token)
if __name__=='__main__':
 try:
  token,who=login()
  path=pathlib.Path(sys.argv[1]);fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w')as f:json.dump({'access_token':token,**who},f)
  print('  Signed in as '+who['email']+' ('+who['reckon_id']+').',file=sys.stderr)
 except Exception as e:print('Browser sign-in failed: '+str(e),file=sys.stderr);sys.exit(1)

RECKON_AUTH_PY
 SESSION_UPLOAD_TOKEN=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["access_token"])' "$AUTH_RESULT")
 RECKON_ID=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["reckon_id"])' "$AUTH_RESULT")
 export RECKON_AUTH_MODE=browser RECKON_ID
 rm -f "$AUTH_RESULT"
fi
# BROWSER_AUTH_END
if [ -z "${SESSION_UPLOAD_TOKEN:-}" ]; then
 if ! { exec 3</dev/tty; } 2>/dev/null; then
  printf '%s\n' 'An interactive terminal is required to enter the upload token privately.' >&2
  exit 1
 fi
 IFS= read -r -s -p 'Upload token (hidden): ' SESSION_UPLOAD_TOKEN <&3
 exec 3<&-
 printf '\n' >/dev/tty
fi
[ -n "$SESSION_UPLOAD_TOKEN" ] || { printf '%s\n' 'Upload token cannot be empty.' >&2; exit 1; }
export SESSION_UPLOAD_TOKEN
trap 'unset SESSION_UPLOAD_TOKEN RECKON_ACCESS_TOKEN; [ -z "${AUTH_RESULT:-}" ] || rm -f "$AUTH_RESULT"' EXIT
INSTALL_DIR=$(python3 - <<'PY'
import hashlib, io, os, pathlib, re, sys, tempfile, urllib.request, zipfile, threading, time
URL = 'https://paxel-intake.aarizvi06.workers.dev/'+('browser/' if os.environ.get('RECKON_AUTH_MODE')=='browser'else '')+'v1/client.zip'
SHA256 = '3152bc571886ff631894c777f0230f62835651fec6f0722f0c341fb404b7edd9'
EXPECTED = {'paxel-intake/'+s for s in ('collect.sh','export-coding-sessions.sh','pack-export.py','upload-archive.py','verify-intake-archive.py','README.md','resume-export.py','reckon_ui.py','mask-export.py','browser-auth.py')}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self, req, fp, code, msg, headers, newurl):
  raise RuntimeError('Client download redirect refused')
LIVE=sys.stderr.isatty()and os.environ.get('TERM','')!='dumb';COLOR=LIVE and 'NO_COLOR' not in os.environ
BLUE='\x1b[1;38;2;20;169;201m' if os.environ.get('COLORTERM','').lower()in('truecolor','24bit')else '\x1b[1;38;5;38m'
def say(text,mark='•'):
 if COLOR:mark=BLUE+mark+'\x1b[0m'
 print(('\r\x1b[2K' if COLOR else '')+'  '+mark+' '+text,file=sys.stderr,flush=True)
stop=threading.Event();start=time.monotonic()
def report():
 while not stop.wait(5):
  say('Still waiting for the network (%ds)...'%(time.monotonic()-start))
thread=threading.Thread(target=report,daemon=True);thread.start()
try:
 say('Checking your sign-in and downloading Reckon...')
 if os.environ.get('RECKON_AUTH_MODE')!='browser'and not re.fullmatch(r'[A-Za-z0-9_-]{20,256}',os.environ['SESSION_UPLOAD_TOKEN']):
  raise RuntimeError('Invalid token format')
 request = urllib.request.Request(URL, headers={**({'cf-access-token':os.environ['SESSION_UPLOAD_TOKEN']}if os.environ.get('RECKON_AUTH_MODE')=='browser'else {'Authorization':'Bearer '+os.environ['SESSION_UPLOAD_TOKEN']}),'User-Agent':'PaxelPrivateIntake/1.0'})
 with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
  total=int(response.headers.get('Content-Length','0'))
  chunks=[];received=0
  while True:
   chunk=response.read(8192)
   if not chunk:break
   received+=len(chunk)
   if received>1024*1024:raise RuntimeError('Client download exceeds size limit')
   chunks.append(chunk)
   if LIVE and total:
    fill=int(24*min(received,total)/total);bar=('━'*fill+'\x1b[2m'+'━'*(24-fill)+'\x1b[0m')if COLOR else '#'*fill+'-'*(24-fill)
    print('\r    '+(BLUE if COLOR else '')+bar+('\x1b[0m' if COLOR else '')+' %d / %d KiB'%(received//1024,total//1024),end='',file=sys.stderr,flush=True)
  if LIVE and total:print(file=sys.stderr)
  data=b''.join(chunks)
 say('Verifying the download against its pinned SHA-256...')
 if len(data)>1024*1024 or hashlib.sha256(data).hexdigest()!=SHA256:
  raise RuntimeError('Client download integrity check failed')
 say('Installing into a private folder...')
 with zipfile.ZipFile(io.BytesIO(data)) as bundle:
  entries=bundle.infolist()
  if len(entries)!=len(EXPECTED) or {i.filename for i in entries}!=EXPECTED or any(i.file_size>1024*1024 for i in entries):
   raise RuntimeError('Unexpected client archive contents')
  folder=pathlib.Path(tempfile.mkdtemp(prefix='paxel-intake.',dir=pathlib.Path.home()))
  bundle.extractall(folder)
 print(folder/'paxel-intake')
except Exception as error:
 print('Client setup failed: '+str(error),file=sys.stderr)
 sys.exit(1)
finally:
 stop.set();thread.join()
PY
)
printf '  %s✓%s Reckon is ready %s(%s)%s\n' "$B" "$R" "$D" "$INSTALL_DIR" "$R"
cd "$INSTALL_DIR"
if [ "${1:-}" = '--resume-export' ]; then
 python3 ./resume-export.py "$RESUME_EXPORT"
else
 bash ./collect.sh "$@"
fi
