#!/usr/bin/env python3
"""Resume a retained, already-selected export without recollecting or dropping sessions."""
import sys,os,json,hashlib,importlib.util,subprocess,tarfile,time
from pathlib import Path
BASE=Path(__file__).resolve().parent
import reckon_ui
ui=reckon_ui.UI()

def load(name):
 spec=importlib.util.spec_from_file_location(name,BASE/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def main():
 if len(sys.argv)!=2:raise ValueError('Usage: resume-export.py /absolute/saved/export')
 root=Path(sys.argv[1]).absolute()
 if not root.is_dir()or root.resolve()!=root:raise ValueError('Saved export folder is missing or linked')
 manifest=(root/'manifest.jsonl').read_bytes();records=[json.loads(line)for line in manifest.splitlines()if line.strip()]
 primaries=[r for r in records if r.get('role')!='context']
 if not 1<=len(primaries)<=50:raise ValueError('Saved manifest must contain 1-50 primary conversations')
 if not os.environ.get('RECKON_BANNER_SHOWN'):ui.banner('Picking up a saved export')
 ui.step(1,2,'Checking your saved export')
 ui.info('Using the same %d files you saved before. Nothing is searched for again, changed or dropped.'%len(records))
 ui.note('Saved export: '+str(root))
 raw_root=root
 masker=load('mask-export')
 with ui.spinner('Masking detected keys in a copy; originals stay unchanged'):
  root,mask_report=masker.derive(raw_root)
 ui.ok('Masked %d detected key-like values in a separate copy.'%mask_report['masked_values'])
 ui.warn('Pattern matching can miss secrets. This is not guaranteed anonymization.')
 ui.note('Masked upload copy: '+str(root))
 manifest=(root/'manifest.jsonl').read_bytes()
 archive=Path(str(root)+'.tar.gz')
 client=load('upload-archive');validator=load('verify-intake-archive')
 def verify_selected_archive(progress=None):
  validator.validate(archive,progress=progress,quiet=progress is not None)
  with tarfile.open(archive,'r:gz')as data:stored=data.extractfile('manifest.jsonl').read()
  if stored!=manifest:raise ValueError('Archive selection does not exactly match the saved export manifest')
 if archive.exists():
  if archive.is_symlink()or not archive.is_file():raise ValueError('Existing archive is not a regular unlinked file')
  ui.info('Found the archive from last time; checking it before reuse.')
  try:
   with ui.progress('Checking','sessions','It matches your saved selection exactly')as advance:verify_selected_archive(advance)
  except (tarfile.TarError,EOFError,OSError,ValueError,KeyError):
   # Preserve the failed output as evidence. Never overwrite or silently drop files.
   import uuid
   backup=archive.with_name(archive.name+'.invalid-'+uuid.uuid4().hex[:8])
   os.link(archive,backup);archive.unlink()
   ui.warn('That archive was incomplete or invalid. It is kept at: '+str(backup))
   ui.info('Packing the SAME saved selection once more; no discovery or session changes.')
 if not archive.exists():
  subprocess.run([sys.executable,str(BASE/'pack-export.py'),str(root),str(archive)],check=True)
  with ui.progress('Checking','sessions','It matches your saved selection exactly')as advance:verify_selected_archive(advance)
 if archive.stat().st_size>client.MAX:raise ValueError('Retained archive exceeds 512 MiB compressed limit. Nothing uploaded; files unchanged')
 ui.ok('Ready to send: %s, %d original sessions.'%(reckon_ui.mib(archive.stat().st_size),len(records)))
 token=os.environ.get('SESSION_UPLOAD_TOKEN','')
 if not token:
  import getpass
  token=getpass.getpass('Upload token (hidden): ')
 ui.step(2,2,'Uploading privately')
 result=client.upload(archive,'https://paxel-intake.aarizvi06.workers.dev',token,expected_sessions=len(primaries))
 if result['sessions']!=len(primaries):raise ValueError('Acceptance session count differs from original saved selection')
 ui.ok('Resume complete: all %d saved sessions (%d primary conversations) accepted. No sessions removed or recollected.'%(len(records),len(primaries)))

if __name__=='__main__':
 try:main()
 except Exception as error:
  err=reckon_ui.UI(sys.stderr)
  err.fail('Resume stopped: '+str(error))
  err.note('Saved export and archive are retained unchanged. Do not delete them or recollect.')
  sys.exit(1)
