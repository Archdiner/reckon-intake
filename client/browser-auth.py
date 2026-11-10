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
