#!/usr/bin/env python3
"""Reckon terminal presentation. Output only: no network, no file writes, no secrets.

Styled output is used only on an interactive terminal. When a stream is not a TTY,
TERM=dumb, or NO_COLOR is set, it falls back to plain lines with no escape codes.
NO_COLOR keeps in-place progress on a terminal but drops all colour and styling.
Progress only ever shows numbers the caller reports (bytes or items actually done).
"""
import contextlib,os,re,shutil,subprocess,sys,threading,time,textwrap

ESC='\x1b['
BRAND=(20,169,201)  # #14A9C9, reckonreview.dev brand blue
WORDMARK=(
 '██████╗ ███████╗ ██████╗██╗  ██╗ ██████╗ ███╗   ██╗',
 '██╔══██╗██╔════╝██╔════╝██║ ██╔╝██╔═══██╗████╗  ██║',
 '██████╔╝█████╗  ██║     █████╔╝ ██║   ██║██╔██╗ ██║',
 '██╔══██╗██╔══╝  ██║     ██╔═██╗ ██║   ██║██║╚██╗██║',
 '██║  ██║███████╗╚██████╗██║  ██╗╚██████╔╝██║ ╚████║',
 '╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝',
)

def _tty(stream):
 try:return stream.isatty()and os.environ.get('TERM','')!='dumb'
 except (AttributeError,ValueError):return False

class UI:
 def __init__(self,stream=None):
  self.stream=stream or sys.stdout
  self.live=_tty(self.stream)
  self.color=self.live and 'NO_COLOR' not in os.environ
  truecolor=os.environ.get('COLORTERM','').lower()in('truecolor','24bit')
  self._blue=('38;2;%d;%d;%d'%BRAND)if truecolor else '38;5;38'
  self.lock=threading.RLock()
  self._live_line=None

 # ---- primitives
 def sgr(self,text,codes):return '%s%sm%s%s0m'%(ESC,codes,text,ESC)if self.color and text else text
 def blue(self,text):return self.sgr(text,self._blue)
 def bold(self,text):return self.sgr(text,'1')
 def bblue(self,text):return self.sgr(text,'1;'+self._blue)
 def dim(self,text):return self.sgr(text,'2')
 def red(self,text):return self.sgr(text,'1;31')
 def yellow(self,text):return self.sgr(text,'33')
 def width(self):return max(40,min(shutil.get_terminal_size((80,24)).columns,100))

 def _clear_live(self):
  if self._live_line is not None:
   self.stream.write('\r'+(ESC+'2K' if self.color else ' '*(self.width()-1)+'\r'))
 def _redraw_live(self):
  if self._live_line is not None:self.stream.write(self._live_line)
 def line(self,text=''):
  with self.lock:
   self._clear_live();self.stream.write(text+'\n');self._redraw_live();self.stream.flush()
 def live_set(self,text):
  with self.lock:
   self._clear_live();self._live_line=text;self.stream.write(text);self.stream.flush()
 def live_end(self,final=None):
  with self.lock:
   self._clear_live();self._live_line=None
   if final is not None:self.stream.write(final+'\n')
   self.stream.flush()

 # ---- message kinds
 def banner(self,subtitle):
  """ASCII wordmark in brand blue on a colour terminal wide enough for it; otherwise one plain heading."""
  if self.color and self.width()>=len(WORDMARK[0])+4:
   self.line('')
   for row in WORDMARK:self.line('  '+self.blue(row))
   self.line('  '+self.dim(subtitle))
  elif self.live:
   self.line(self.bold('Reckon'));self.line(self.dim(subtitle))
  else:self.line('Reckon: '+subtitle)
 def step(self,n,total,text):
  self.line('');self.line(self.bblue('● ')+self.bold(text)+self.dim('   step %d of %d'%(n,total)))
 def wrapped(self,text,prefix='  ',style=None):
  lines=textwrap.wrap(str(text),width=max(20,self.width()-len(prefix)-1),break_long_words=False,break_on_hyphens=False)or['']
  for index,line in enumerate(lines):self.line((prefix if index==0 else ' '*len(prefix))+(style(line)if style else line))
 def info(self,text):self.wrapped(text)
 def note(self,text):self.wrapped(text,style=self.dim)
 def ok(self,text):self.line('  '+self.blue('✓')+' '+text)
 def warn(self,text):
  lines=textwrap.wrap(str(text),width=max(20,self.width()-5),break_long_words=False,break_on_hyphens=False)or['']
  for i,line in enumerate(lines):self.line(('  '+self.yellow('!')+' 'if i==0 else '    ')+line)
 def fail(self,text):self.line(self.red('✗')+' '+text)
 def detail(self,text):self.line('  '+self.dim('│ '+text))

 def summary(self,title,rows):
  """A closing box. Rows are (label, value) pairs of real, already-confirmed numbers."""
  if not self.live:
   self.line(title)
   for k,v in rows:self.line('  %s: %s'%(k,v))
   return
  w=min(self.width(),96)-2;kw=max(len(k)for k,_ in rows)
  def row(text,plain):self.line(self.blue('│')+' '+text+' '*max(0,w-1-len(plain))+self.blue('│'))
  self.line('');self.line(self.blue('╭'+'─'*w+'╮'))
  row(self.bblue('✓ ')+self.bold(title),'✓ '+title);row('','')
  for k,v in rows:
   v=str(v);room=w-4-kw
   if len(v)>room:v='…'+v[-(room-1):]
   text='%s  %s'%(self.dim(k.ljust(kw)),v);row(text,k.ljust(kw)+'  '+v)
  self.line(self.blue('╰'+'─'*w+'╯'))

 # ---- progress
 def bar(self,label,total,unit='bytes',note=''):return Bar(self,label,total,unit,note)
 @contextlib.contextmanager
 def progress(self,label,unit,final):
  """A bar whose total arrives with the first update(done,total) call, e.g. from the validator.
  It is cleared if the block raises, so the caller's own error handling stays unchanged."""
  b=Bar(self,label,0,unit,'')
  try:yield b.update
  except BaseException:
   b.abandon();raise
  b.close(final(b)if callable(final)else final)
 @contextlib.contextmanager
 def spinner(self,label,heartbeat=15,done=None):
  """Shows that work continues, with elapsed time only: never a made-up percentage."""
  stop=threading.Event();start=time.monotonic()
  frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  def run():
   i=0
   while not stop.wait(0.1 if self.live else heartbeat):
    s=int(time.monotonic()-start)
    if self.live:self.live_set('  '+self.blue(frames[i%len(frames)])+' '+label+self.dim('  %s'%clock(s)));i+=1
    else:self.line('  %s: still working (%s elapsed)'%(label,clock(s)))
  if not self.live:self.line('  '+label+'...')
  t=threading.Thread(target=run,daemon=True);t.start()
  ok=False
  try:
   yield;ok=True
  finally:
   stop.set();t.join()
   if self.live:self.live_end(('  '+self.blue('✓')+' '+(done or label)+self.dim('  %s'%clock(int(time.monotonic()-start))))if ok else None)
   elif ok and done:self.line('  '+done)

class Bar:
 """Progress over a real total. update() takes the amount actually completed."""
 def __init__(self,ui,label,total,unit,note):
  self.ui=ui;self.label=label;self.total=max(total,1);self.unit=unit;self.note=note
  self.done=0;self.start=time.monotonic();self._drawn=0.0;self._plain_step=-1
 def _amount(self):
  if self.unit=='bytes':return '%s / %s'%(mib(self.done),mib(self.total))
  return '%d / %d %s'%(self.done,self.total,self.unit)
 def update(self,done,total=None,extra=''):
  with self.ui.lock:
   if total:self.total=total
   self.done=min(done,self.total);frac=self.done/self.total;now=time.monotonic()
   if self.ui.live:
    if now-self._drawn<0.08 and self.done<self.total:return
    self._drawn=now
    bw=max(10,min(32,self.ui.width()-58))
    fill=int(round(frac*bw))
    if self.ui.color:barstr=self.ui.blue('━'*fill)+self.ui.dim('━'*(bw-fill))
    else:barstr='#'*fill+'-'*(bw-fill)
    text='  %s %s %s %s'%(self.label.ljust(11),barstr,('%3d%%'%int(frac*100)),self.ui.dim(self._amount()+('  '+extra if extra else '')))
    self.ui.live_set(text)
   else:
    step=int(frac*10)
    if step!=self._plain_step:
     self._plain_step=step
     self.ui.line('  %s: %d%% (%s%s)'%(self.label,int(frac*100),self._amount(),', '+extra if extra else ''))
 def close(self,final):
  elapsed=clock(int(time.monotonic()-self.start))
  if self.ui.live:self.ui.live_end('  '+self.ui.blue('✓')+' '+final+self.ui.dim('  '+elapsed))
  else:self.ui.line('  '+final+' ('+elapsed+')')
 def abandon(self):
  if self.ui.live:self.ui.live_end(None)

def short(path):
 """A path as the participant would type it: relative to the current folder, else ~/..."""
 path=os.path.abspath(str(path));here=os.getcwd()+os.sep;home=os.path.expanduser('~')+os.sep
 if path.startswith(here):return path[len(here):]
 return '~'+os.sep+path[len(home):]if path.startswith(home)else path

def mib(n):return '%.1f MiB'%(n/1024**2)if n>=1024**2 else ('%.0f KiB'%(n/1024)if n>=1024 else '%d B'%n)
def clock(s):return '%dm %02ds'%(s//60,s%60)if s>=60 else '%ds'%s

# ---- CLI for the bash scripts
SELECTED=re.compile(r'^\[([\w-]+)\] (.+?)  \((.*)\)$')
def _project(label):
 label=re.sub(r' \(.*\)$','',label).rstrip('/')
 return re.sub(r'^-Users-[^-]+-(code-)?','',label.split('/')[-1])or label

def _run(ui,label,argv):
 """Run a helper script, showing its output as indented detail under a live spinner.
 On a terminal, the per-file selection list is tallied by project and long lines are trimmed;
 in plain mode (pipes, logs) every line is passed through unchanged.
 Lines starting with 'REVIEW:' (secret-scan hits) are shown as warnings, unchanged."""
 proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace',bufsize=1)
 tally={}
 with ui.spinner(label):
  for raw in proc.stdout:
   text=raw.rstrip('\n')
   if not text.strip():continue
   if text.strip().startswith('REVIEW:'):
    hit=text.strip()[len('REVIEW:'):].strip()
    ui.warn(hit.replace(os.getcwd()+os.sep,'')if ui.live else hit);continue
   if not ui.live:ui.line(text);continue
   m=SELECTED.match(text.strip())
   if m:
    key='%s (%s)'%(_project(m.group(3)),m.group(1));tally[key]=tally.get(key,0)+1;continue
   if tally and text.strip().startswith('Done:'):
    ui.detail('Selected by project: '+', '.join('%s %d'%(k,v)for k,v in sorted(tally.items(),key=lambda kv:-kv[1])))
   room=ui.width()-6;line=text.strip()
   ui.detail(line if len(line)<=room else line[:room-1]+'…')
  code=proc.wait()
  if code:raise SystemExit(code)
 return 0

def main(argv):
 ui=UI()
 cmd,args=argv[0],argv[1:]
 if cmd=='banner':ui.banner(' '.join(args))
 elif cmd=='step':ui.step(int(args[0]),int(args[1]),' '.join(args[2:]))
 elif cmd in('info','note','ok','warn','detail'):getattr(ui,cmd)(' '.join(args))
 elif cmd=='fail':UI(sys.stderr).fail(' '.join(args))
 elif cmd=='run':
  sep=args.index('--');return _run(ui,' '.join(args[:sep]),args[sep+1:])
 else:raise SystemExit('reckon_ui: unknown command '+cmd)
 return 0

if __name__=='__main__':sys.exit(main(sys.argv[1:]))
