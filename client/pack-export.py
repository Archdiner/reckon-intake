#!/usr/bin/env python3
"""Pack only manifest-listed regular files,without following links or adding sourcepaths."""
import sys,json,tarfile,os,importlib.util,tempfile
from pathlib import Path
import reckon_ui
ui=reckon_ui.UI()
try:
 root=Path(sys.argv[1]).absolute();destination=Path(sys.argv[2]);records=[json.loads(x)for x in(root/'manifest.jsonl').read_text().splitlines()if x.strip()]
 primaries=[r for r in records if r.get('role')!='context']
 pconv={r.get('conversation')or r['file']for r in primaries}
 if not 1<=len(pconv)<=50 or len(records)>248:raise ValueError('Export must contain 1-50 primary conversations')
 names=['manifest.jsonl']+[r['file']for r in records]
 if(root/'summary.txt').is_file():names.append('summary.txt')
 if len(names)!=len(set(names))or len(names)>250:raise ValueError('Duplicate or excessive export members')
 for n in names:
  if not isinstance(n,str)or n.startswith('/')or'\\'in n or any(x in('','.','..')for x in n.split('/')):raise ValueError('Unsafe export path')
  p=root/n
  if not p.is_file()or p.resolve()!=p or root not in p.parents:raise ValueError('Missing or linked export file')
 if destination.exists():raise ValueError('Archive already exists;not overwriting')
 fd,partial_name=tempfile.mkstemp(prefix='.'+destination.name+'.partial-',dir=destination.parent);os.close(fd);partial=Path(partial_name)
 sizes=[(root/n).stat().st_size for n in names];packed=0
 with ui.progress('Packing','bytes',lambda b:'Packed %d files (%s of transcripts)'%(len(records),reckon_ui.mib(b.done)))as advance:
  with tarfile.open(partial,'w:gz',format=tarfile.PAX_FORMAT)as archive:
   for n,s in zip(names,sizes):
    archive.add(root/n,arcname=n,recursive=False);packed+=s;advance(packed,sum(sizes))
 os.chmod(partial,0o600)
 spec=importlib.util.spec_from_file_location('validator',Path(__file__).with_name('verify-intake-archive.py'));validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
 with ui.progress('Checking','files','Every file in the archive matches its fingerprint')as advance:validator.validate(partial,progress=advance,quiet=True)
 if partial.stat().st_size>512*1024**2:raise ValueError('Archive exceeds 512 MiB compressed limit. Export and archive retained; nothing uploaded.')
 os.link(partial,destination);partial.unlink()
 ui.ok('Archive ready: %s'%reckon_ui.mib(destination.stat().st_size))
 ui.note(reckon_ui.short(destination))
except Exception as error:
 err=reckon_ui.UI(sys.stderr)
 err.fail("Archive preparation stopped: "+str(error))
 err.note("Saved export is unchanged. Nothing uploaded.")
 sys.exit(1)
