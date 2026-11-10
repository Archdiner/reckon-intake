// Self-test for the preview buddy. Runs the real script the way Claude Code
// would (JSON on stdin) against a synthetic transcript and a temporary
// RECKON_HOME. All data here is invented. Run: node prototype/buddy/buddy.test.mjs
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,copyFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const here=dirname(fileURLToPath(import.meta.url));
const script=join(here,'buddy.mjs');
const home=mkdtempSync(join(tmpdir(),'reckon-buddy-test-'));
let n=0;const pass=m=>{n++;console.log('PASS',m);};
try{
 copyFileSync(join(here,'buddy-rules.example.json'),join(home,'buddy-rules.json'));
 const run=(mode,input)=>{const r=spawnSync(process.execPath,[script,mode],{input:JSON.stringify(input),env:{...process.env,RECKON_HOME:home},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const logLines=()=>readFileSync(join(home,'buddy.log'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
 const transcript=join(home,'t.jsonl');
 const user=text=>({type:'user',message:{role:'user',content:text}});
 const edits=k=>({type:'assistant',message:{content:Array.from({length:k},(_,i)=>({type:'tool_use',name:'Edit',input:{file_path:`/repo/src/f${i}.ts`}}))}});
 const write=entries=>writeFileSync(transcript,entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
 const statusIn=(sid='s1')=>({session_id:sid,workspace:{project_dir:'/work/demo-app'},model:{id:'model-x',display_name:'Model X'},cost:{total_cost_usd:0.4249},context_window:{used_percentage:31.2}});
 const stopIn=(sid='s1',extra={})=>({session_id:sid,transcript_path:transcript,cwd:'/work/demo-app',hook_event_name:'Stop',stop_hook_active:false,last_assistant_message:'Done.',...extra});

 // Status line: quiet by default, model and usage on the right, logged once per change.
 assert.equal(run('status',statusIn()),'· Reckon  |  Model X · $0.42 · ctx 31%');
 run('status',statusIn());
 assert.equal(logLines().filter(l=>l.kind==='status').length,1);
 pass('status line: quiet glyph, model and usage visible, logged only when it changes');

 // Nothing to say: no output at all.
 write([user('Fix the typo in the header.'),edits(1)]);
 assert.equal(run('stop',stopIn()),'');
 pass('stop hook stays silent when no rule holds');

 // Scope growth: a small ask that touched many files.
 write([user('Fix the typo in the header.'),edits(1),{type:'user',message:{content:[{type:'tool_result',content:'ok'}]}},{type:'user',isMeta:true,message:{content:'meta'}},user('<command-name>/clear</command-name>'),user('Keep it simple, just make the button blue.'),edits(5)]);
 const out=JSON.parse(run('stop',stopIn()));
 assert.deepEqual(Object.keys(out),['systemMessage'],'only a message for the person; never additionalContext or a decision');
 assert.match(out.systemMessage,/^Reckon: You asked for something small/);
 const nudge=logLines().find(l=>l.kind==='nudge');assert.equal(nudge.rule,'scope-growth');assert.equal(nudge.files_touched,5);assert.equal(nudge.prompt,'Keep it simple, just make the button blue.');
 assert.match(run('status',statusIn()),/^◆ Reckon: You asked for something small/);
 pass('a small ask that touched five files: one line for the person, logged with its rule, glyph changes');

 // At most one thought per session; a hook-driven continuation is ignored.
 write([user('Fix the typo in the header.'),edits(1),user('Keep it simple, just make the button blue.'),edits(5),user('no, revert that'),edits(6)]);
 assert.equal(run('stop',stopIn()),'');
 assert.equal(run('stop',stopIn('s1',{stop_hook_active:true})),'');
 const follow=logLines().find(l=>l.kind==='followup');assert.equal(follow.rule,'scope-growth');assert.equal(follow.next_prompt,'no, revert that');
 pass('one thought per session; the next prompt after it is logged for later judgment');

 // Adapts without a model: the same rule goes quiet on this project after three showings.
 for(const sid of ['s2','s3','s4']){write([user('just a small fix please'),edits(4)]);run('stop',stopIn(sid));}
 assert.equal(logLines().filter(l=>l.kind==='nudge'&&l.rule==='scope-growth').length,3);
 pass('a rule shown three times on a project stops firing there');

 // Other rules.
 write([user('no, smaller'),user('stop adding things'),user('simpler please')]);
 assert.match(JSON.parse(run('stop',stopIn('s5'))).systemMessage,/Three redirects in a row/);
 write([user('Add a settings page.'),edits(1)]);
 assert.match(JSON.parse(run('stop',stopIn('s6',{last_assistant_message:'Added a gradient header with a subtle animation.'}))).systemMessage,/visual polish/);
 pass('redirect run and ornament rules');

 // Local only.
 const src=readFileSync(script,'utf8');
 for(const re of [/https?:/,/\bfetch\(/,/node:(http|https|net|dgram|tls|child_process)/,/additionalContext"?\s*:/,/decision"?\s*:/])assert(!re.test(src),`${re} in buddy.mjs`);
 pass('no network, no subprocesses, never emits additionalContext or a decision');
 console.log(n,'buddy checks PASS');
}finally{rmSync(home,{recursive:true,force:true});}
