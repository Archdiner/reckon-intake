#!/usr/bin/env python3
"""Upload one immutable coding-session archive. No HF token needed on this computer."""
import argparse,hashlib,importlib.util,json,os,re,shutil,tempfile,time,urllib.request,urllib.error,urllib.parse,threading,contextlib,sys,http.client,ssl,socket
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import reckon_ui
ui=reckon_ui.UI()
CHUNK=3*1024**2;MAX=512*1024**2
class RestageRequired(ValueError):pass
class UnmaskedArchive(ValueError):pass
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None

def activity(label,done=None):
 return ui.spinner(label,done=done)

def upload(path,endpoint,token,opener=None,pause=time.sleep,expected_sessions=None):
 started=time.monotonic()
 u=urllib.parse.urlsplit(endpoint)
 if u.scheme!='https' or not u.netloc or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):raise ValueError('Endpoint must be an HTTPS origin')
 browser=os.environ.get('RECKON_AUTH_MODE')=='browser'
 if browser and not re.fullmatch(r'rk_[a-f0-9]{32}',os.environ.get('RECKON_ID','')):raise ValueError('Verified Reckon identity missing. Re-run the browser sign-in installer')
 if not browser and (not isinstance(token,str)or not re.fullmatch('[A-Za-z0-9_-]{20,256}',token)):raise ValueError('Missing or invalid upload token')
 openurl=opener or urllib.request.build_opener(NoRedirect()).open
 def post(route,body,headers=None):
  request=urllib.request.Request(endpoint.rstrip('/')+('/browser' if browser else '')+route,data=body,method='POST',headers={'User-Agent':'PaxelPrivateIntake/1.0',**({'cf-access-token':token}if browser else {'Authorization':'Bearer '+token}),'Content-Type':'application/octet-stream',**(headers or {})})
  for attempt in range(4):
   if route=='/v2/part' and abort_upload.is_set():raise RuntimeError('Upload stopped after another part failed; retry the same archive')
   try:
    with openurl(request,timeout=600 if route=='/v2/finalize'else 180)as response:
     if response.status!=200:raise ValueError('Upload not acknowledged')
     return json.loads(response.read(65537))
   except urllib.error.HTTPError as e:
    if e.code==409:
     try:reason=json.loads(e.read(16384))
     except (ValueError,OSError):reason={}
     if reason.get('code')=='restage-required':raise RestageRequired('Previously staged object expired; re-stage the same retained archive')from None
    retry_after=e.headers.get('Retry-After','')if e.headers else ''
    if e.code==429 and retry_after.isdigit()and int(retry_after)>90:
     raise ValueError('Private storage is rate-limited. Retry the SAME archive after at least %d minutes; local files retained.'%((int(retry_after)+59)//60))from None
    if e.code not in (408,429,500,502,503,504):raise ValueError('Upload refused (HTTP %s); local archive retained'%e.code)from None
   except (urllib.error.URLError,TimeoutError,ConnectionError,http.client.IncompleteRead,ssl.SSLError,socket.timeout):pass
   if attempt<3:
    delay=min(15*(attempt+1),45)
    ui.warn('The connection hiccuped on %s. Trying again in %ds (retry %d of 3); nothing is lost.'%(route,delay,attempt+1))
    pause(delay)
  raise RuntimeError('Upload not confirmed. Retry the SAME retained archive; do not re-export.')
 if shutil.disk_usage(tempfile.gettempdir()).free<Path(path).stat().st_size+16*1024**2:raise ValueError('Not enough temporary disk space for the immutable upload snapshot; original archive retained')
 with tempfile.TemporaryDirectory(prefix='intake-snapshot-')as tmp:
  snapshot=Path(tmp)/'archive.tar.gz'
  with activity('Making a private copy to upload from'):shutil.copyfile(path,snapshot)
  size=snapshot.stat().st_size
  if not 0<size<=MAX:raise ValueError('Archive exceeds 512 MiB compressed limit; nothing uploaded')
  spec=importlib.util.spec_from_file_location('validator',Path(__file__).with_name('verify-intake-archive.py'));validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
  with ui.progress('Checking','files',lambda b:'All %d files match their fingerprints'%b.total)as advance:validator.validate(snapshot,progress=advance,quiet=True)
  with __import__('tarfile').open(snapshot,'r:gz')as archive:
   local_sessions=sum(1 for line in archive.extractfile('manifest.jsonl')if line.strip()and json.loads(line).get('role')!='context')
  if expected_sessions is None:expected_sessions=local_sessions
  elif expected_sessions!=local_sessions:raise ValueError('Saved selection count does not match this archive')
  hash_all=hashlib.sha256();chunks=[]
  with ui.progress('Preparing','bytes',lambda b:'Split into %d parts of up to 3 MiB'%len(chunks))as advance:
   with snapshot.open('rb')as source:
    while True:
     block=source.read(CHUNK)
     if not block:break
     hash_all.update(block);chunks.append({'sha256':hashlib.sha256(block).hexdigest(),'size':len(block)});advance(sum(c['size']for c in chunks),size)
  digest=hash_all.hexdigest()
  manifest={'version':1,'sha256':digest,'size':size,'chunks':chunks}
  if browser:
   with activity('Reserving capacity for this exact archive'):
    reserved=post('/v2/begin',json.dumps(manifest,separators=(',',':')).encode(),{'Content-Type':'application/json'})
   if reserved.get('status')!='reserved'or reserved.get('sha256')!=digest or reserved.get('size')!=size or reserved.get('reckon_id')!=os.environ.get('RECKON_ID'):raise ValueError('Upload reservation identity or archive mismatch')
  ui.info('Sending %s in %d parts. Nothing counts as received until Reckon confirms the whole archive at the end.'%(reckon_ui.mib(size),len(chunks)))
  progress_lock=threading.Lock();completed=[0,0]
  state_path=Path(str(path)+'.upload-state.json');token_hash=hashlib.sha256((os.environ.get('RECKON_ID','')if browser else token).encode()).hexdigest()
  try:
   state=json.loads(state_path.read_text())
   if state.get('version')==2 and state.get('sha256')==digest and state.get('size')==size and state.get('endpoint')==endpoint and state.get('token_hash')==token_hash and isinstance(state.get('chunks'),list) and len(state['chunks'])==len(chunks):
    for current,saved in zip(chunks,state['chunks']):
     if current['sha256']==saved.get('sha256')and current['size']==saved.get('size')and re.fullmatch('[a-f0-9]{64}',saved.get('stage_ticket','')):current['stage_ticket']=saved['stage_ticket']
  except (OSError,ValueError,TypeError,AttributeError):pass
  def save_state():
   state={'version':2,'sha256':digest,'size':size,'endpoint':endpoint,'token_hash':token_hash,'chunks':chunks}
   tmp_state=state_path.with_name(state_path.name+'.tmp-'+str(os.getpid()))
   with os.fdopen(os.open(tmp_state,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w')as out:json.dump(state,out)
   os.replace(tmp_state,state_path)
  abort_upload=threading.Event();bar=[None]
  def part(i):
   if abort_upload.is_set():return
   c=chunks[i]
   if c.get('stage_ticket'):
    with progress_lock:
     completed[0]+=c['size'];completed[1]+=1
     bar[0](completed[0],size,'%d/%d parts (sent earlier)'%(completed[1],len(chunks)))
    return
   with snapshot.open('rb')as source:
    source.seek(i*CHUNK);block=source.read(c['size'])
   if len(block)!=c['size']or hashlib.sha256(block).hexdigest()!=c['sha256']:raise ValueError('Local immutable snapshot changed')
   if abort_upload.is_set():return
   try:r=post('/v2/part',block,{'X-Archive-Sha256':digest,'X-Chunk-Sha256':c['sha256'],'X-Chunk-Index':str(i)})
   except Exception:
    abort_upload.set();raise
   if r.get('status')!='part-staged'or r.get('sha256')!=c['sha256']or r.get('bytes')!=c['size']or r.get('index')!=i or not re.fullmatch('[a-f0-9]{64}',r.get('stage_ticket','')):raise ValueError('Part staged receipt mismatch')
   with progress_lock:
    c['stage_ticket']=r['stage_ticket'];save_state()
    completed[0]+=c['size'];completed[1]+=1
    bar[0](completed[0],size,'%d/%d parts'%(completed[1],len(chunks)))
  ui.note('Progress is saved privately beside your archive, so an interrupted upload can pick up where it left off.')
  if not ui.live:ui.note('Retry state: '+str(state_path))
  for staging_attempt in range(2):
   with ui.progress('Uploading','bytes',lambda b:'Sent all %d parts (%s); waiting for Reckon to confirm'%(len(chunks),reckon_ui.mib(size)))as advance:
    bar[0]=advance
    with ThreadPoolExecutor(max_workers=2)as pool:list(pool.map(part,range(len(chunks))))
   try:
    with activity('Reckon is checking the whole archive on its side (not received yet)',done='Reckon replied; checking its receipt'):
     r=post('/v2/finalize',json.dumps(manifest,separators=(',',':')).encode(),{'Content-Type':'application/json'})
    break
   except RestageRequired:
    if staging_attempt:raise ValueError('Private staging objects remain unavailable after one re-stage. Same local archive retained; no acceptance claimed')from None
    ui.warn('Some parts expired on the receiving side before they were saved. Sending this SAME archive once more; your sessions do not change.')
    for c in chunks:c.pop('stage_ticket',None)
    save_state();completed[:]=[0,0]
  if r.get('status')!='accepted'or r.get('sha256')!=digest or r.get('size')!=size or not isinstance(r.get('sessions'),int)or not 1<=r['sessions']<=50 or not r.get('revision')or not r.get('parts_revision')or not r.get('manifest_path'):raise ValueError('No verified archive acceptance receipt')
  if expected_sessions is not None and r['sessions']!=expected_sessions:raise ValueError('Acceptance session count differs from original saved selection')
  receipt=Path(str(path)+'.receipt.json')
  fd,receipt_tmp=tempfile.mkstemp(prefix='.'+receipt.name+'.partial-',dir=receipt.parent)
  with os.fdopen(fd,'w')as out:json.dump(r,out,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
  os.replace(receipt_tmp,receipt)
  ui.summary('Done. Reckon received your sessions.',[
   ('Sessions accepted',str(r['sessions'])),
   ('Archive','%s in %d parts, all fingerprints checked'%(reckon_ui.mib(size),len(chunks))),
   ('Time',reckon_ui.clock(int(time.monotonic()-started))),
   ('Receipt',reckon_ui.short(receipt)),
   ('Receipt revision',str(r['revision'])),
   ('Batch',str(r['manifest_path'])),
   ('Kept on this computer','your export folder and archive')])
  return r

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('archive');p.add_argument('--endpoint',default='https://paxel-intake.aarizvi06.workers.dev');p.add_argument('--token-env',default='SESSION_UPLOAD_TOKEN');p.add_argument('--allow-unmasked',action='store_true',help='Explicitly bypass the best-effort masking marker check for an intentional raw upload');a=p.parse_args()
 if not a.allow_unmasked:
  with __import__('tarfile').open(a.archive,'r:gz')as archive:
   entry=archive.getmember('manifest.jsonl')
   if entry.size>10*1024**2:raise ValueError('Manifest too large')
   records=[json.loads(line)for line in archive.extractfile(entry)if line.strip()]
  if not records or any(r.get('reckon_masking')!='reckon-key-mask-v2'for r in records):raise UnmaskedArchive('Archive does not have the current masking marker (reckon-key-mask-v2). Use resume-export.py on the original export to make a freshly masked copy. No upload attempted')
 else:ui.warn('Unmasked upload explicitly requested. Key-like values may be sent unchanged.')
 token=os.environ.get(a.token_env,'')
 if not token:
  import getpass
  token=getpass.getpass('Upload token (hidden): ')
 upload(a.archive,a.endpoint,token)
if __name__=='__main__':
 try:main()
 except Exception as error:
  err=reckon_ui.UI(sys.stderr)
  err.fail('Upload not confirmed: '+str(error))
  if len(sys.argv)>1:
   archive=str(Path(sys.argv[1]).resolve())
   err.note('Local archive retained: '+archive)
   if isinstance(error,UnmaskedArchive):
    err.note('Use python3 resume-export.py with the original saved export folder to make a masked copy. Do not retry this raw archive.')
    sys.exit(1)
   err.note('Retry from this installed folder: python3 upload-archive.py '+__import__('shlex').quote(archive))
   err.note('Use the same archive, not a new export. The retry asks for your token at a hidden prompt if needed. Never paste the token into a command.')
  sys.exit(1)
