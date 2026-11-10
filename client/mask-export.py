#!/usr/bin/env python3
"""Deterministic best-effort key masking on a derived export. No network calls.
Known key formats and named secret values become equal-length stars. This is not
an anonymity guarantee and deliberately leaves ordinary prose/identifiers alone.
Original files are never edited; only manifest-listed session copies are emitted.
"""
import hashlib,json,os,re,sys,tempfile,shutil
from pathlib import Path
VERSION='reckon-key-mask-v2'
class MaskLimitError(ValueError):pass
def limit_error(source,kind,size,line=None):
 safe_name=mask_text(str(source),[0])
 location=' record %d'%line if line is not None else ''
 return MaskLimitError('Masking stopped: '+json.dumps(safe_name)+' '+kind+location+' is '+str(size)+' bytes, above the 64 MiB per-document/record limit. Original export retained; nothing uploaded. No session was dropped.')
SECRET_FIELD=re.compile(r'(?i)^(?:[a-z0-9]+[_-])*(?:(?:api|access|auth|refresh|id|bearer|session|client|private|secret|service|upload)[_-]?)?(?:key|token|secret|password|passwd|pwd|authorization|credential|credentials|connection[_-]?string)$')
PATTERNS=[
 re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
 re.compile(r'(?<![A-Za-z0-9_-])(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|rk-[A-Za-z0-9_-]{16,}|re_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|hf_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|npm_[A-Za-z0-9]{20,})(?![A-Za-z0-9_-])'),
 re.compile(r'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])'),
]
BEARER=re.compile(r'(?i)(\bBearer\s+)([A-Za-z0-9._~+/-]{12,}={0,2})')
ASSIGN=re.compile(r'''(?ix)(\b(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET[_-]?KEY|CLIENT[_-]?SECRET|PRIVATE[_-]?KEY|PASSWORD|PASSWD|UPLOAD[_-]?TOKEN|TOKEN|SECRET|AUTHORIZATION|CREDENTIAL)|apiKey|accessToken|clientSecret)\b["']?\s*[:=]\s*)(?:"((?:\\.|[^"\\]){4,})"|'((?:\\.|[^'\\]){4,})'|([^\s"'`,;<>}{\]]{4,}))''')
URL_SECRET=re.compile(r'(https?://[^\s/:@]+:)([^\s/@]+)(@)',re.I)
QUERY_SECRET=re.compile(r'(?i)([?&](?:api[_-]?key|access[_-]?token|token|secret|password|signature|sig)=)([^&#\s]+)')
PLACEHOLDER=re.compile(r'(?i)^(?:\*+|<[^>]*>|\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*|none|null|undefined|true|false|example|placeholder|your[_-].*|redacted)$')

def mask_text(value,stats):
 def stars(match):stats[0]+=1;return '*'*len(match.group(0))
 for pattern in PATTERNS:value=pattern.sub(stars,value)
 def group_value(match):
  if match.re is ASSIGN:
   secret=next(v for v in match.groups()[1:]if v is not None)
   if PLACEHOLDER.fullmatch(secret):return match.group(0)
   stats[0]+=1
   quote='"'if match.group(2)is not None else("'"if match.group(3)is not None else'')
   return match.group(1)+quote+'*'*len(secret)+quote
  secret=match.group(2)
  if PLACEHOLDER.fullmatch(secret):return match.group(0)
  stats[0]+=1
  return match.group(1)+'*'*len(secret)+(match.group(3)if match.lastindex==3 else '')
 for pattern in (BEARER,ASSIGN,URL_SECRET,QUERY_SECRET):value=pattern.sub(group_value,value)
 return value

def mask_object(obj,stats,field=''):
 if isinstance(obj,dict):return {key:mask_object(value,stats,key)for key,value in obj.items()}
 if isinstance(obj,list):return [mask_object(value,stats,field)for value in obj]
 if isinstance(obj,str):
  if SECRET_FIELD.fullmatch(field)and obj and not PLACEHOLDER.fullmatch(obj):
   stats[0]+=1;return '*'*len(obj)
  return mask_text(obj,stats)
 return obj

def mask_file(source,destination):
 stats=[0]
 # Whole JSON documents stay whole JSON. JSONL is processed one record at a time.
 limit=64*1024**2
 if source.suffix.lower()=='.json':
  if source.stat().st_size>limit:raise limit_error(source,'JSON document',source.stat().st_size)
  obj=json.loads(source.read_text(encoding='utf-8'))
  destination.write_text(json.dumps(mask_object(obj,stats),ensure_ascii=True,separators=(',',':'))+'\n',encoding='utf-8')
 else:
  with source.open('rb')as original,destination.open('w',encoding='utf-8')as out:
   in_pem=False;line_number=0
   while True:
    rawline=original.readline(limit+1)
    if not rawline:break
    line_number+=1
    if len(rawline)>limit:
     size=len(rawline);last=rawline
     while last and not last.endswith(b'\n'):
      last=original.readline(limit+1);size+=len(last)
     raise limit_error(source,'JSONL/text',size,line_number)
    line=rawline.decode('utf-8',errors='strict')
    body=line[:-1]if line.endswith('\n')else line;ending='\n'if line.endswith('\n')else''
    if in_pem:
     out.write('*'*len(body)+ending)
     if re.search(r'-----END [A-Z ]*PRIVATE KEY-----',line):in_pem=False
     continue
    if not line.strip():out.write(line);continue
    try:obj=json.loads(line)
    except ValueError:
     # Text transcripts stay text. Malformed JSON-looking lines fail closed.
     if line.lstrip().startswith(('{','[')):raise ValueError('A JSON-like session line is malformed; original export retained')from None
     if re.search(r'-----BEGIN [A-Z ]*PRIVATE KEY-----',line):
      in_pem=not bool(re.search(r'-----END [A-Z ]*PRIVATE KEY-----',line));stats[0]+=1;out.write('*'*len(body)+ending);continue
     out.write(mask_text(line,stats));continue
    out.write(json.dumps(mask_object(obj,stats),ensure_ascii=True,separators=(',',':'))+'\n')
 os.chmod(destination,0o600)
 return stats[0]

def digest_file(path):
 h=hashlib.sha256()
 with path.open('rb')as f:
  while block:=f.read(1024**2):h.update(block)
 return h.hexdigest()

def derive(root):
 root=Path(root).absolute()
 if not root.is_dir()or root.resolve()!=root:raise ValueError('Saved export is missing or linked')
 manifest=root/'manifest.jsonl'
 if not manifest.is_file()or manifest.is_symlink():raise ValueError('Saved manifest is missing or linked')
 if manifest.stat().st_size>10*1024**2:raise ValueError('Saved manifest exceeds 10 MiB limit')
 raw=manifest.read_bytes();records=[json.loads(line)for line in raw.splitlines()if line.strip()]
 primaries=[r for r in records if r.get('role')!='context']
 pconv={r.get('conversation')or r['file']for r in primaries}
 if not 1<=len(pconv)<=50 or len(records)>248:raise ValueError('Saved export must contain 1-50 primary conversations')
 names=set();total=0
 for record in records:
  name=record.get('file');parts=name.split('/')if isinstance(name,str)else []
  if not parts or name.startswith('/')or'\\'in name or any(p in ('','.','..')for p in parts)or name in names:raise ValueError('Unsafe or duplicate saved session path')
  source=root/name
  if not source.is_file()or source.resolve()!=source or root not in source.parents:raise ValueError('Saved session is missing or linked')
  size=source.stat().st_size;total+=size
  if size!=record.get('bytes')or digest_file(source)!=record.get('sha256'):raise ValueError('Saved session no longer matches its manifest')
  names.add(name)
 if total>512*1024**2:raise ValueError('Saved export exceeds 512 MiB expanded limit')
 folder=Path(tempfile.mkdtemp(prefix=root.name+'.'+VERSION+'-',dir=root.parent));os.chmod(folder,0o700)
 masked=[];count=0
 for record in records:
  source=root/record['file'];destination=folder/record['file'];destination.parent.mkdir(parents=True,exist_ok=True)
  count+=mask_file(source,destination)
  if source.stat().st_size!=record['bytes']or digest_file(source)!=record['sha256']:raise ValueError('Source changed while masking; original retained')
  # Source paths and cwd can also contain URL credentials. Mask metadata strings.
  stats=[0];clean=mask_object(record,stats);count+=stats[0]
  clean.update(file=record['file'],bytes=destination.stat().st_size,sha256=digest_file(destination),reckon_masking=VERSION)
  masked.append(clean)
 (folder/'manifest.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=True,separators=(',',':'))+'\n'for r in masked))
 (folder/'summary.txt').write_text('Reckon derived export\nmasker: '+VERSION+'\nconversations: '+str(len(pconv))+' primary conversations, '+str(len(records)-len(primaries))+' context files\nDetected values masked: '+str(count)+'\nBest-effort deterministic patterns, not proof of anonymity or absence of secrets.\nOriginal export is unchanged.\n')
 os.chmod(folder/'manifest.jsonl',0o600);os.chmod(folder/'summary.txt',0o600)
 # Final all-file size check includes metadata, matching the archive validator.
 if sum(p.stat().st_size for p in folder.rglob('*')if p.is_file())>512*1024**2:raise ValueError('Masked export exceeds 512 MiB expanded limit; original retained')
 stable=root.with_name(root.name+'.'+VERSION+'-'+hashlib.sha256(VERSION.encode()+raw).hexdigest()[:12])
 if stable.exists():
  if stable.is_symlink()or not stable.is_dir():raise ValueError('Derived export path is unsafe')
  expected={str(p.relative_to(folder)):digest_file(p)for p in folder.rglob('*')if p.is_file()}
  found={str(p.relative_to(stable)):digest_file(p)for p in stable.rglob('*')if p.is_file()and not p.is_symlink()}
  if expected!=found or any(p.is_symlink()for p in stable.rglob('*')):raise ValueError('Existing masked copy changed; original retained')
  shutil.rmtree(folder);folder=stable
 else:folder.rename(stable);folder=stable
 return folder,{'version':VERSION,'sessions':len(pconv),'context_files':len(records)-len(primaries),'masked_values':count}

if __name__=='__main__':
 try:
  import reckon_ui
  ui=reckon_ui.UI(sys.stderr)
  with ui.spinner('Masking detected keys in a separate copy; originals stay unchanged'):folder,report=derive(sys.argv[1])
  print(folder)
  ui.note('Masked %d detected key-like values in a copy of %d primary conversations. Originals unchanged. Patterns can miss secrets.'%(report['masked_values'],report['sessions']))
 except MaskLimitError as error:
  print(str(error),file=sys.stderr);sys.exit(1)
 except Exception:
  # Do not echo malformed input or matched credentials through exception strings.
  print('Key masking stopped safely. Original export retained; no upload attempted.',file=sys.stderr);sys.exit(1)
