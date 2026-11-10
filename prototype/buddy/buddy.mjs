#!/usr/bin/env node
// PREVIEW PROTOTYPE. Not wired into anything; nothing installs or runs it.
// See README.md in this folder before trying it.
//
// A lean terminal companion for Claude Code, in one file with no dependencies:
//   node buddy.mjs status   status line command: reads the status line JSON
//   node buddy.mjs stop     Stop hook command: reads the Stop hook JSON
//
// It runs locally only: no network, no model calls. It reads the session's own
// transcript on disk, writes only under RECKON_HOME (default ~/.reckon), and
// logs every line it shows to RECKON_HOME/buddy.log (one JSON object per line).
// Its Stop output is a systemMessage for the person only. It never returns
// additionalContext or a decision, so it cannot steer the agent.
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,openSync,readSync,fstatSync,closeSync} from 'node:fs';
import {join,basename} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const HOME=process.env.RECKON_HOME||join(homedir(),'.reckon');
const STATE=join(HOME,'state');
const LOG=join(HOME,'buddy.log');
const PENDING_MS=120000;          // how long a fresh thought stays in the status line
const TRANSCRIPT_TAIL=262144;     // read at most the last 256 KB of the transcript

const readJson=(p,fallback)=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{return fallback;}};
const writeJson=(p,v)=>{mkdirSync(STATE,{recursive:true});writeFileSync(p,JSON.stringify(v));};
const log=entry=>{mkdirSync(HOME,{recursive:true});appendFileSync(LOG,JSON.stringify({ts:new Date().toISOString(),...entry})+'\n');};
const safeName=s=>String(s||'unknown').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,80);
const stdin=()=>{try{return JSON.parse(readFileSync(0,'utf8')||'{}');}catch{return {};}};
const rulesFile=()=>readJson(join(HOME,'buddy-rules.json'),{rules:[],projects:{}});

// The person's own prompts and the agent's file edits in the current session.
// Meta lines, tool results and command echoes are skipped: echoes were a known
// source of misreads in session data.
export function readTurns(path){
 if(!path||!existsSync(path))return [];
 const fd=openSync(path,'r');let text;
 try{const size=fstatSync(fd).size,start=Math.max(0,size-TRANSCRIPT_TAIL),buf=Buffer.alloc(size-start);readSync(fd,buf,0,buf.length,start);text=buf.toString('utf8');}finally{closeSync(fd);}
 const turns=[];
 for(const line of text.split('\n')){
  let e;try{e=JSON.parse(line);}catch{continue;}
  if(!e||e.isMeta)continue;
  const content=e.message?.content;
  if(e.type==='user'){
   const prompt=typeof content==='string'?content:Array.isArray(content)&&content.length&&content.every(c=>c.type==='text')?content.map(c=>c.text).join('\n'):null;
   if(prompt&&!prompt.trimStart().startsWith('<'))turns.push({prompt:prompt.trim(),edits:new Set()});
  }else if(e.type==='assistant'&&Array.isArray(content)&&turns.length){
   for(const c of content)if(c.type==='tool_use'&&['Edit','Write','MultiEdit','NotebookEdit'].includes(c.name)&&c.input?.file_path)turns[turns.length-1].edits.add(c.input.file_path);
  }
 }
 return turns;
}

// Deterministic rules. Each returns true when its condition holds for this turn.
export const KINDS={
 // The prompt asked for something small, and the turn touched many files.
 scope_growth:(r,{turns})=>{const t=turns.at(-1);return !!t&&new RegExp(r.params?.askedSmall||'\\b(simple|simpler|small|smallest|minimal|just|only|lean)\\b','i').test(t.prompt)&&t.edits.size>=(r.params?.minFiles??4);},
 // Several redirects in a row in this session.
 repeated_redirect:(r,{turns})=>{const k=r.params?.inARow??3,re=new RegExp(r.params?.redirect||"^(no|nope|don't|do not|stop|simpler|less|too much|actually|undo|revert)\\b",'i');const last=turns.slice(-k);return last.length===k&&last.every(t=>re.test(t.prompt));},
 // The agent's final message talks about ornament.
 ornament:(r,{last})=>new RegExp(r.params?.words||'\\b(animation|animated|gradient|drop shadow|glow|confetti|decorative|flourish)\\b','i').test(last||''),
};

const project=input=>basename(input.workspace?.project_dir||input.cwd||'')||'unknown';

export function status(input){
 const sid=safeName(input.session_id),proj=project(input),sp=join(STATE,`session-${sid}.json`);
 const st=readJson(sp,{});
 const rules=rulesFile();
 const pending=st.pending&&Date.now()-st.pending.at<PENDING_MS?st.pending:null;
 const phrase=rules.projects?.[proj]?.phrase;
 const left=pending?`◆ Reckon: ${pending.text}`:`· Reckon${phrase?` · ${phrase}`:''}`;
 const model=input.model?.display_name||input.model?.id||null;
 const cost=input.cost?.total_cost_usd,ctx=input.context_window?.used_percentage;
 const right=[model,Number.isFinite(cost)?`$${cost.toFixed(2)}`:null,Number.isFinite(ctx)?`ctx ${Math.round(ctx)}%`:null].filter(Boolean).join(' · ');
 const line=right?`${left}  |  ${right}`:left;
 // Log only when the line changes; the status line re-runs on every update.
 if(st.lastLine!==line){st.lastLine=line;writeJson(sp,st);log({kind:'status',session:sid,project:proj,line,model});}
 return line;
}

export function stop(input){
 if(input.stop_hook_active)return null;
 const sid=safeName(input.session_id),proj=project(input);
 const sp=join(STATE,`session-${sid}.json`),pp=join(STATE,`project-${safeName(proj)}.json`);
 const st=readJson(sp,{}),ps=readJson(pp,{shown:{}});
 const turns=readTurns(input.transcript_path);
 // Record what came right after the last thought, so its value can be judged later.
 if(st.awaitingFollowup&&turns.length>st.awaitingFollowup.turnCount){
  log({kind:'followup',session:sid,project:proj,rule:st.awaitingFollowup.rule,next_prompt:turns[st.awaitingFollowup.turnCount].prompt.slice(0,300)});
  delete st.awaitingFollowup;
 }
 const rules=rulesFile(),max=rules.maxPerSession??1;
 if((st.spoken||0)<max){
  for(const r of rules.rules||[]){
   const fn=KINDS[r.kind];if(!fn||!r.text)continue;
   // Adapts without a model: a rule shown enough times on this project goes quiet.
   if((ps.shown[r.id]||0)>=(r.maxShowsPerProject??3))continue;
   if(!fn(r,{turns,last:input.last_assistant_message}))continue;
   st.spoken=(st.spoken||0)+1;st.pending={text:r.text,rule:r.id,at:Date.now()};st.awaitingFollowup={rule:r.id,turnCount:turns.length};
   ps.shown[r.id]=(ps.shown[r.id]||0)+1;
   writeJson(sp,st);writeJson(pp,ps);
   log({kind:'nudge',session:sid,project:proj,rule:r.id,text:r.text,prompt:turns.at(-1)?.prompt.slice(0,300)??null,files_touched:turns.at(-1)?.edits.size??0});
   return {systemMessage:`Reckon: ${r.text}`};
  }
 }
 writeJson(sp,st);
 return null;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(mode==='status')process.stdout.write(status(stdin())+'\n');
 else if(mode==='stop'){const out=stop(stdin());if(out)process.stdout.write(JSON.stringify(out)+'\n');}
}
