// Tests for the Reckon buddy and its installer. Everything runs against
// temporary folders used as HOME; nothing touches the real ~/.reckon or
// ~/.claude. All data is invented. Run: node prototype/buddy/buddy.test.mjs
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=dirname(fileURLToPath(import.meta.url));
const temps=[];
const tmp=()=>{const d=mkdtempSync(join(tmpdir(),'reckon-buddy-test-'));temps.push(d);return d;};
let n=0;const pass=m=>{n++;console.log('PASS',m);};

// Import the module with RECKON_HOME pointing at a temp folder.
const unitHome=tmp();process.env.RECKON_HOME=unitHome;
const B=await import(join(here,'buddy.mjs'));

try{
 // ---------- Pet rendering ----------
 const now=Date.now();
 assert.equal(B.petState({},now),'sleeping');
 assert.equal(B.petState({lastActive:now-60000},now),'attentive');
 assert.equal(B.petState({lastActive:now-600000},now),'sleeping');
 assert.equal(B.petState({spoke:{at:now-30000},lastActive:now},now),'speaking');
 assert.equal(B.petState({spoke:{at:now-300000},lastActive:now-60000},now),'attentive');
 const usage={model:'Model X',cost:0.4249,ctx:31.2};
 assert.equal(B.petLine('sleeping',usage),'(-,-) zz reckon  |  Model X · $0.42 · ctx 31%');
 assert.equal(B.petLine('attentive',usage),'(o,o) reckon  |  Model X · $0.42 · ctx 31%');
 assert.equal(B.petLine('speaking',{...usage,says:'added flourish - keep or strip?'}),'(o,o)> added flourish - keep or strip?  |  Model X · $0.42 · ctx 31%');
 assert.equal(B.petLine('attentive'),'(o,o) reckon');
 assert.equal(B.petLine('speaking',{says:'two\nlines\u001b[31m here'}),'(o,o)> two lines [31m here');
 pass('pet: sleeping, attentive and speaking render as single terminal-safe lines');

 // ---------- Runtime, via the CLI exactly as Claude Code calls it ----------
 const home=tmp(),rh=join(home,'.reckon');mkdirSync(rh,{recursive:true});
 const env={...process.env,RECKON_HOME:rh};
 const rules=JSON.parse(readFileSync(join(here,'rules.default.json'),'utf8'));
 const setRules=ids=>writeFileSync(join(rh,'rules.json'),JSON.stringify({...rules,rules:rules.rules.map(r=>({...r,enabled:ids.includes(r.id)}))}));
 const run=(mode,input,e=env)=>{const r=spawnSync(process.execPath,[join(here,'buddy.mjs'),mode],{input:typeof input==='string'?input:JSON.stringify(input),env:e,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return r.stdout;};
 const logs=()=>existsSync(join(rh,'buddy.log'))?readFileSync(join(rh,'buddy.log'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
 const tr=join(home,'t.jsonl');
 const T0=Date.parse('2026-11-01T09:00:00Z');
 const user=(text,min=0)=>({type:'user',timestamp:new Date(T0+min*60000).toISOString(),message:{role:'user',content:text}});
 const edits=(k,content='x')=>({type:'assistant',message:{content:Array.from({length:k},(_,i)=>({type:'tool_use',name:'Edit',input:{file_path:`/repo/src/f${i}.ts`,new_string:content}}))}});
 const said=text=>({type:'assistant',message:{content:[{type:'text',text}]}});
 const write=entries=>writeFileSync(tr,entries.map(e=>typeof e==='string'?e:JSON.stringify(e)).join('\n')+'\n');
 const stopIn=(sid,extra={})=>({session_id:sid,transcript_path:tr,cwd:'/work/demo-app',hook_event_name:'Stop',stop_hook_active:false,last_assistant_message:'Done.',...extra});
 const statusIn=(sid,tokens=0)=>({session_id:sid,cwd:'/work/demo-app',model:{display_name:'Model X'},cost:{total_cost_usd:0.42},context_window:{total_input_tokens:tokens,total_output_tokens:0,used_percentage:31}});
 const msg=out=>{const o=JSON.parse(out);assert.deepEqual(Object.keys(o),['systemMessage'],'only a message for the person');assert(!o.systemMessage.includes('\n'));assert(o.systemMessage.startsWith('(o,o)> '));return o.systemMessage;};

 // Nothing is enabled until the user says so.
 write([user('Keep it simple, fix the header.'),edits(6)]);
 assert.equal(run('stop',stopIn('nothing-on')),'');
 setRules([]);assert.equal(run('stop',stopIn('nothing-on')),'');
 pass('no rules file, or all rules off: the owl says nothing');

 setRules(rules.rules.map(r=>r.id));

 // Status line: sleeping before any activity, attentive after.
 assert.equal(run('status',statusIn('s1',0)),'(-,-) zz reckon  |  Model X · $0.42 · ctx 31%\n');
 assert.equal(run('status',statusIn('s1',1200)),'(o,o) reckon  |  Model X · $0.42 · ctx 31%\n');
 pass('status line: sleeping, then attentive after activity');

 // scope-growth via files touched.
 write([user('Keep it simple, fix the header.'),edits(6)]);
 assert.equal(msg(run('stop',stopIn('s1'))),'(o,o)> this grew past the ask - trim to the smallest version?');
 assert.equal(run('status',statusIn('s1',1500)),'(o,o)> this grew past the ask - trim to the smallest version?  |  Model X · $0.42 · ctx 31%\n');
 pass('scope-growth fires on a short request that edited 6 files; status line shows the owl speaking');

 // Hard cap: one interruption per session, across all rules.
 write([user('Keep it simple, fix the header.'),edits(6),user('Add a hero.'),edits(1,'background: linear-gradient(red, blue);')]);
 assert.equal(run('stop',stopIn('s1')),'');
 assert(logs().some(l=>l.kind==='skip'&&l.rule==='ornament'&&l.why==='session-cap'));
 assert.equal(run('stop',stopIn('s1',{stop_hook_active:true})),'');
 pass('a second rule matching in the same session is skipped and logged: at most one interruption per session');

 // Each starter rule, each in its own session.
 write([user('Fix the typo.'),said('Fixed it. I also added a dark mode toggle while I was at it.'),edits(1)]);
 assert.match(msg(run('stop',stopIn('s2'))),/grew past the ask/);
 write([user('no, smaller'),user('Make the list.'),user('stop adding options'),user('actually just two items')]);
 assert.match(msg(run('stop',stopIn('s3'))),/several redirects/);
 write([user('Add a settings page with the existing styles, nothing new, and keep the layout the same as the profile page please, thanks.'),edits(1,'.card { box-shadow: 0 2px 8px #0003; }')]);
 assert.match(msg(run('stop',stopIn('s4'))),/added flourish/);
 write([user('Add a settings page with the existing styles, nothing new, and keep the layout the same as the profile page please, thanks.'),edits(1,'Saved ✨')]);
 assert.match(msg(run('stop',stopIn('s5'))),/added flourish/);
 write([user('Add pagination to the table, following the existing pattern used on the orders page, and keep the page size at twenty.'),said('Here is the plan:\n1. Read the table\n2. Add state\n3. Add buttons\n4. Wire handlers\n5. Test')]);
 assert.match(msg(run('stop',stopIn('s6'))),/skip the plan/);
 write([user('Start the migration work for the billing tables as discussed in the design doc, one table at a time.',0),edits(1),user('Continue with the next table in the same way as before, and run the tests after each one.',95),edits(1)]);
 assert.match(msg(run('stop',stopIn('s7'))),/about 90 minutes in/);
 pass('each starter rule fires on its own pattern: files or extras, redirects, gradient/shadow/emoji, long plan with no changes, about 90 minutes');

 // Per-project quiet-down: scope-growth fired in s1 and s2 on this project; one more, then quiet.
 write([user('Keep it simple, fix the header.'),edits(6)]);
 assert.match(msg(run('stop',stopIn('s8'))),/grew past the ask/);
 assert.equal(run('stop',stopIn('s9')),'');
 assert(logs().some(l=>l.kind==='skip'&&l.rule==='scope-growth'&&l.why==='project-quiet'));
 assert.match(msg(run('stop',stopIn('s10',{cwd:'/work/other-app'}))),/grew past the ask/);
 pass('a rule goes quiet on a project after 3 fires, and stays live on other projects');

 // ---------- Robustness ----------
 assert.equal(run('stop','not json at all'),'');
 assert.equal(run('status','{broken'),'(-,-) zz reckon\n');
 write(['garbage line',JSON.stringify([1,2]),'null',JSON.stringify({type:'user',message:{content:[{type:'tool_result',content:'x'}]}}),JSON.stringify({type:'assistant',message:{content:'not a list'}})]);
 assert.equal(run('stop',stopIn('s11')),'');
 assert.equal(run('stop',stopIn('s12',{transcript_path:join(home,'missing.jsonl')})),'');
 assert.equal(run('stop',stopIn('s13',{transcript_path:{not:'a path'}})),'');
 writeFileSync(join(rh,'state','s-'+'0'.repeat(12)+'.json'),'{corrupt');
 writeFileSync(join(rh,'rules.json'),'{ this is not json');
 write([user('Keep it simple, fix the header.'),edits(6)]);
 assert.equal(run('stop',stopIn('s14',{cwd:'/work/third-app'})),'');
 assert.equal(run('status',statusIn('s14',10)),'(o,o) reckon  |  Model X · $0.42 · ctx 31%\n');
 const errs=logs().filter(l=>l.kind==='error');
 assert(errs.some(l=>l.why==='stdin'));assert(errs.some(l=>l.why==='rules'));
 pass('malformed stdin, transcript, state and rules never crash the hook: silent, exit 0, logged');

 // ---------- Log hygiene ----------
 const raw=readFileSync(join(rh,'buddy.log'),'utf8');
 for(const l of logs()){
  assert.deepEqual(Object.keys(l).filter(k=>!['ts','kind','rule','session','why'].includes(k)),[],'only ts, kind, rule, session hash, why');
  assert(['fire','skip','error'].includes(l.kind));
  assert(l.session===null||/^[0-9a-f]{12}$/.test(l.session));
 }
 for(const leak of ['Keep it simple','fix the header','linear-gradient','box-shadow','/repo/src','/work/demo-app','dark mode','"s1"','Model X'])assert(!raw.includes(leak),`log contains ${leak}`);
 const rotLog=join(unitHome,'buddy.log');
 writeFileSync(rotLog,'x'.repeat(1024*1024+10));B.log('error',{why:'rotate-test'});
 assert(existsSync(rotLog+'.1'));assert(statSync(rotLog).size<1000);
 pass('log holds only timestamp, kind, rule, session hash and a reason word; it rotates at 1 MB');

 // ---------- Source checks ----------
 const src=readFileSync(join(here,'buddy.mjs'),'utf8')+readFileSync(join(here,'install.mjs'),'utf8');
 for(const re of [/https?:\/\//,/\bfetch\(/,/node:(http|https|net|dgram|tls|dns)/,/XMLHttpRequest|WebSocket/,/"additionalContext"|additionalContext:/,/\bdecision:/])assert(!re.test(src),`${re} in source`);
 pass('no network, no model calls, never emits additionalContext or a decision');

 // ---------- Installer ----------
 const install=(h,answers,args=[])=>spawnSync(process.execPath,[join(here,'install.mjs'),...args],{input:answers,env:{...process.env,HOME:h,RECKON_HOME:''},encoding:'utf8'});
 const settingsOf=h=>JSON.parse(readFileSync(join(h,'.claude','settings.json'),'utf8'));
 const backups=h=>existsSync(join(h,'.claude'))?readdirSync(join(h,'.claude')).filter(f=>f.startsWith('settings.json.reckon-backup-')):[];
 const ourStatus=h=>`node "${join(h,'.reckon','buddy.mjs')}" status`,ourStop=h=>`node "${join(h,'.reckon','buddy.mjs')}" stop`;

 // Fresh machine: nothing existed.
 {const h=tmp();const r=install(h,'y\nn\ny\nn\nn\n');assert.equal(r.status,0,r.stdout+r.stderr);
  const s=settingsOf(h);assert.deepEqual(s.statusLine,{type:'command',command:ourStatus(h)});assert.deepEqual(s.hooks.Stop,[{hooks:[{type:'command',command:ourStop(h)}]}]);
  const rj=JSON.parse(readFileSync(join(h,'.reckon','rules.json'),'utf8'));assert.deepEqual(rj.rules.map(x=>x.enabled),[true,false,true,false,false]);
  assert(existsSync(join(h,'.reckon','buddy.mjs')));assert.equal(backups(h).length,0);
  assert.match(r.stdout,/Created .*settings\.json/);assert.match(r.stdout,/Rules switched on: scope-growth, ornament/);assert.match(r.stdout,/starter suggestions, not findings about you/);
  // Reinstall with no answers keeps choices, does not duplicate the Stop hook, and backs up first.
  const r2=install(h,'');assert.equal(r2.status,0);
  assert.equal(settingsOf(h).hooks.Stop.length,1);assert.equal(backups(h).length,1);
  assert.deepEqual(JSON.parse(readFileSync(join(h,'.reckon','rules.json'),'utf8')).rules.map(x=>x.enabled),[true,false,true,false,false]);
  // All answers empty on a fresh install: nothing turns on.
  const h2=tmp();install(h2,'');assert.deepEqual(JSON.parse(readFileSync(join(h2,'.reckon','rules.json'),'utf8')).rules.map(x=>x.enabled),[false,false,false,false,false]);}
 pass('installer, fresh: asks per rule, nothing on by default, adds both entries once, reinstall is idempotent');

 // Existing settings: a status line command, another Stop hook, other keys.
 {const h=tmp();mkdirSync(join(h,'.claude'));
  const theirsCmd=`${JSON.stringify(process.execPath)} -e "process.stdout.write('THEIRS line')"`;
  const original={theme:'dark',statusLine:{type:'command',command:theirsCmd,padding:1},hooks:{Stop:[{hooks:[{type:'command',command:'say done'}]}],PreToolUse:[{matcher:'Bash',hooks:[{type:'command',command:'guard.sh'}]}]},permissions:{allow:['Bash(ls)']}};
  const text=JSON.stringify(original,null,4);writeFileSync(join(h,'.claude','settings.json'),text);
  const r=install(h,'n\nn\nn\nn\ny\n');assert.equal(r.status,0,r.stdout);
  assert.equal(backups(h).length,1);assert.equal(readFileSync(join(h,'.claude',backups(h)[0]),'utf8'),text,'backup is the untouched original');
  const s=settingsOf(h);
  assert.deepEqual(s.statusLine,{type:'command',command:ourStatus(h),padding:1});
  assert.equal(s.theme,'dark');assert.deepEqual(s.permissions,original.permissions);assert.deepEqual(s.hooks.PreToolUse,original.hooks.PreToolUse);
  assert.deepEqual(s.hooks.Stop,[{hooks:[{type:'command',command:'say done'}]},{hooks:[{type:'command',command:ourStop(h)}]}]);
  assert(r.stdout.includes(`it still runs your previous command first and prints its output unchanged: ${theirsCmd}`));
  assert(r.stdout.includes(`hooks.Stop: ${ourStop(h)}`));
  // The wrapped status line prints the old output unchanged, then the owl.
  const out=spawnSync(process.execPath,[join(h,'.reckon','buddy.mjs'),'status'],{input:JSON.stringify(statusIn('w1',0)),env:{...process.env,HOME:h,RECKON_HOME:''},encoding:'utf8'}).stdout;
  assert.equal(out,'THEIRS line\n(-,-) zz reckon  |  Model X · $0.42 · ctx 31%\n');
  // Uninstall restores the original status line exactly and removes only the owl's hook.
  const u=install(h,'',['--uninstall']);assert.equal(u.status,0);
  assert.deepEqual(settingsOf(h),original);assert.equal(backups(h).length,2);
  assert.match(u.stdout,/restored your previous status line/);assert.match(u.stdout,/removed 1 owl entry/);
  assert(existsSync(join(h,'.reckon','rules.json')));assert(!existsSync(join(h,'.reckon','install.json')));}
 pass('installer, existing settings: timestamped backup first, old status line wrapped not lost, other hooks and keys kept; uninstall restores the original');

 // A status line that cannot be wrapped: asks; "no" leaves it, "yes" replaces and uninstall restores.
 {const h=tmp();mkdirSync(join(h,'.claude'));const odd={statusLine:{type:'static',text:'hi'}};writeFileSync(join(h,'.claude','settings.json'),JSON.stringify(odd));
  let r=install(h,'n\nn\nn\nn\nn\nn\n');assert.equal(r.status,0);assert.deepEqual(settingsOf(h).statusLine,odd.statusLine);assert.match(r.stdout,/statusLine: yours, unchanged/);
  r=install(h,'n\nn\nn\nn\nn\ny\n');assert.equal(r.status,0);assert.deepEqual(settingsOf(h).statusLine,{type:'command',command:ourStatus(h)});assert.match(r.stdout,/replaced with/);
  install(h,'',['--uninstall']);assert.deepEqual(settingsOf(h).statusLine,odd.statusLine);assert.equal(settingsOf(h).hooks,undefined);}
 pass('installer: an unwrappable status line is only replaced on an explicit yes, and restored on uninstall');

 // Malformed settings: refuse, touch nothing.
 {const h=tmp();mkdirSync(join(h,'.claude'));writeFileSync(join(h,'.claude','settings.json'),'{ "theme": "dark", oops');
  const r=install(h,'y\ny\ny\ny\ny\n');assert.equal(r.status,1);assert.match(r.stdout,/not valid JSON\. Nothing was changed/);
  assert.equal(readFileSync(join(h,'.claude','settings.json'),'utf8'),'{ "theme": "dark", oops');assert.equal(backups(h).length,0);assert(!existsSync(join(h,'.reckon')));
  writeFileSync(join(h,'.claude','settings.json'),JSON.stringify({hooks:{Stop:{not:'a list'}}}));
  assert.equal(install(h,'').status,1);assert(!existsSync(join(h,'.reckon')));
  const u=install(tmp(),'',['--uninstall']);assert.equal(u.status,0);assert.match(u.stdout,/nothing to remove/);}
 pass('installer: malformed settings stop it before anything is touched; uninstall with no settings is a no-op');

 console.log(n,'buddy checks PASS');
}finally{for(const d of temps)rmSync(d,{recursive:true,force:true});}
