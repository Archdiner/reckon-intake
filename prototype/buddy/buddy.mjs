#!/usr/bin/env node
// Reckon buddy: a small owl for Claude Code's status line that speaks up at
// most once per session, at the end of a turn, when one of the rules the user
// switched on matches. Installed by install.mjs; see README.md.
//
//   node buddy.mjs status   status line command (Claude Code sends JSON on stdin)
//   node buddy.mjs stop     Stop hook command (Claude Code sends JSON on stdin)
//
// Local only: no network, no model calls. It reads the session's transcript on
// disk after each turn and writes only under RECKON_HOME (default ~/.reckon).
// Its Stop output is a systemMessage for the person; it never returns
// additionalContext or a decision, so it cannot steer the agent.
// Every failure is silent to the session and logged to RECKON_HOME/buddy.log.
// The log holds only a timestamp, kind, rule id, a hash of the session id, and
// a word from a fixed list saying why. Never prompts, quotes or file contents.
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,existsSync,openSync,readSync,fstatSync,closeSync,statSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME=process.env.RECKON_HOME||join(process.env.HOME||homedir(),'.reckon');
const STATE=join(HOME,'state');
export const LOG=join(HOME,'buddy.log');
const LOG_MAX=1024*1024;             // rotate at 1 MB; one previous file is kept
const SPEAK_MS=120000;               // the owl keeps "speaking" for 2 minutes
const ATTENTIVE_MS=180000;           // and stays awake 3 minutes after activity
const QUIET_AFTER=3;                 // a rule goes quiet on a project after 3 fires
const TAIL=262144;                   // read at most the last 256 KB of a transcript
const HEAD=65536;                    // and the first 64 KB, for the session start time

// The owl. Plain ASCII, so it renders the same in any terminal.
export const PET={sleeping:'(-,-) zz',attentive:'(o,o)',speaking:'(o,o)>'};

const hash=s=>createHash('sha256').update(String(s??'')).digest('hex').slice(0,12);

export function log(kind,{rule=null,session=null,why=null}={}){
 try{
  mkdirSync(HOME,{recursive:true});
  if(existsSync(LOG)&&statSync(LOG).size>=LOG_MAX)renameSync(LOG,LOG+'.1');
  const e={ts:new Date().toISOString(),kind,rule,session:session?hash(session):null};
  if(why)e.why=why;
  appendFileSync(LOG,JSON.stringify(e)+'\n');
 }catch{}
}

const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
const readJsonOr=(p,fallback)=>{try{return readJson(p);}catch{return fallback;}};
const writeJson=(p,v)=>{mkdirSync(STATE,{recursive:true});writeFileSync(p,JSON.stringify(v));};
const sessionFile=id=>join(STATE,`s-${hash(id)}.json`);
const projectFile=dir=>join(STATE,`p-${hash(dir)}.json`);

function readSlice(path,fromEnd,size){
 const fd=openSync(path,'r');
 try{const total=fstatSync(fd).size,start=fromEnd?Math.max(0,total-size):0,len=Math.min(size,total-start),buf=Buffer.alloc(len);readSync(fd,buf,0,len,start);return buf.toString('utf8');}
 finally{closeSync(fd);}
}
const parseLines=text=>text.split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(e=>e&&typeof e==='object');

// The person's own prompts and what the agent did after each one. Meta lines,
// tool results and command echoes are skipped; echoes were a known source of
// misreads in session data. Malformed lines are ignored.
export function readSession(path){
 if(typeof path!=='string'||!path||!existsSync(path))return {turns:[],firstTs:null,lastTs:null};
 const entries=parseLines(readSlice(path,true,TAIL));
 const head=parseLines(readSlice(path,false,HEAD));
 const ts=e=>{const t=Date.parse(e?.timestamp);return Number.isFinite(t)?t:null;};
 const firstTs=head.map(ts).find(t=>t!==null)??null;
 const lastTs=[...entries].reverse().map(ts).find(t=>t!==null)??null;
 const turns=[];
 for(const e of entries){
  if(e.isMeta)continue;
  const content=e.message?.content;
  if(e.type==='user'){
   const prompt=typeof content==='string'?content:Array.isArray(content)&&content.length&&content.every(c=>c?.type==='text'&&typeof c.text==='string')?content.map(c=>c.text).join('\n'):null;
   if(prompt&&!prompt.trimStart().startsWith('<'))turns.push({prompt:prompt.trim(),edits:new Set(),added:[],texts:[],tools:0});
  }else if(e.type==='assistant'&&Array.isArray(content)&&turns.length){
   const t=turns[turns.length-1];
   for(const c of content){
    if(c?.type==='text'&&typeof c.text==='string')t.texts.push(c.text);
    if(c?.type==='tool_use'){
     t.tools++;
     const i=c.input||{};
     if(['Edit','Write','MultiEdit','NotebookEdit'].includes(c.name)&&typeof i.file_path==='string'){
      t.edits.add(i.file_path);
      for(const s of [i.new_string,i.content,i.new_source,...(Array.isArray(i.edits)?i.edits.map(x=>x?.new_string):[])])if(typeof s==='string')t.added.push(s.slice(0,20000));
     }
    }
   }
  }
 }
 return {turns,firstTs,lastTs};
}

const STEER=/^(no|nope|don'?t|do not|stop|instead|actually|not that|wait|simpler|smaller|less|too much|revert|undo|remove that|go back)\b/i;
const EXTRAS=/\b(i also|also added|additionally,? i|as a bonus|went ahead and|while i was at it)\b/i;
const ORNAMENT=/(linear-gradient|radial-gradient|conic-gradient|box-shadow|drop-shadow|text-shadow|@keyframes|\banimation\s*:|\banimate-|\bshadow-(sm|md|lg|xl|2xl)\b|\bbg-gradient-)/i;
const EMOJI=/\p{Extended_Pictographic}/u;

// Each check returns true when its condition holds for the turn that just ended.
export const CHECKS={
 scope_growth:(p,{turns,last})=>{
  const t=turns.at(-1);if(!t)return false;
  const small=t.prompt.split(/\s+/).length<=(p.smallRequestMaxWords??25);
  return small&&(t.edits.size>=(p.minFiles??4)||EXTRAS.test([...t.texts,last||''].join('\n')));
 },
 redirect_run:(p,{turns})=>turns.filter(t=>STEER.test(t.prompt)).length>=(p.minRedirects??3),
 ornament:(p,{turns})=>{const t=turns.at(-1);return !!t&&t.added.some(s=>ORNAMENT.test(s)||EMOJI.test(s));},
 plan_ceremony:(p,{turns})=>{
  const t=turns.at(-1);if(!t||t.tools>0||!t.texts.length)return false;
  return t.texts[0].split('\n').filter(l=>/^\s*(\d+[.)]|[-*])\s+\S/.test(l)).length>=(p.minSteps??5);
 },
 session_length:(p,{firstTs,lastTs})=>firstTs!==null&&lastTs!==null&&lastTs-firstTs>=(p.minutes??90)*60000,
};

function loadRules(){
 const r=readJson(join(HOME,'rules.json'));
 if(!r||!Array.isArray(r.rules))throw Object.assign(new Error('rules'),{stage:'rules'});
 return r.rules.filter(x=>x&&x.enabled===true&&typeof x.says==='string'&&x.says.trim()&&CHECKS[x.kind]);
}

// One line, safe for a terminal: no control characters, bounded length.
const oneLine=s=>String(s).replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160);

export function stop(input){
 const session=input?.session_id;
 if(input?.stop_hook_active)return null;
 const sp=sessionFile(session),st=readJsonOr(sp,{});
 let rules;
 try{rules=loadRules();}catch(e){log('error',{session,why:'rules'});return null;}
 if(!rules.length)return null;
 let ctx;
 try{ctx={...readSession(input?.transcript_path),last:typeof input?.last_assistant_message==='string'?input.last_assistant_message:''};}
 catch{log('error',{session,why:'transcript'});return null;}
 const projectDir=input?.cwd||'';
 const pp=projectFile(projectDir),ps=readJsonOr(pp,{fires:{}});
 for(const r of rules){
  let hit=false;
  try{hit=CHECKS[r.kind](r.params||{},ctx);}catch{log('error',{rule:r.id,session,why:'check'});continue;}
  if(!hit)continue;
  // The promise: at most one interruption per session, across all rules.
  if(st.spoke){log('skip',{rule:r.id,session,why:'session-cap'});continue;}
  if((ps.fires?.[r.id]||0)>=QUIET_AFTER){log('skip',{rule:r.id,session,why:'project-quiet'});continue;}
  st.spoke={rule:r.id,at:Date.now()};
  ps.fires={...(ps.fires||{}),[r.id]:(ps.fires?.[r.id]||0)+1};
  try{writeJson(sp,st);writeJson(pp,ps);}catch{log('error',{rule:r.id,session,why:'state'});return null;}
  log('fire',{rule:r.id,session});
  return {systemMessage:`${PET.speaking} ${oneLine(r.says)}`};
 }
 return null;
}

export function petState(st,now=Date.now()){
 if(st.spoke&&now-st.spoke.at<SPEAK_MS)return 'speaking';
 if(st.lastActive&&now-st.lastActive<ATTENTIVE_MS)return 'attentive';
 return 'sleeping';
}

export function petLine(state,{says,model,cost,ctx}={}){
 const left=state==='speaking'&&says?`${PET.speaking} ${oneLine(says)}`:`${PET[state]||PET.sleeping} reckon`;
 const right=[model?oneLine(model):null,Number.isFinite(cost)?`$${cost.toFixed(2)}`:null,Number.isFinite(ctx)?`ctx ${Math.round(ctx)}%`:null].filter(Boolean).join(' · ');
 return right?`${left}  |  ${right}`:left;
}

export function status(input,raw=''){
 const session=input?.session_id;
 const sp=sessionFile(session),st=readJsonOr(sp,{});
 // Activity = the session's token count moved since the last refresh.
 const tokens=(input?.context_window?.total_input_tokens||0)+(input?.context_window?.total_output_tokens||0);
 if(tokens&&tokens!==st.tokens){st.tokens=tokens;st.lastActive=Date.now();try{writeJson(sp,st);}catch{log('error',{session,why:'state'});}}
 const state=petState(st);
 let says=null;
 if(state==='speaking'){try{says=loadRules().concat().find(r=>r.id===st.spoke.rule)?.says??null;}catch{}}
 const mine=petLine(state,{says,model:input?.model?.display_name||input?.model?.id,cost:input?.cost?.total_cost_usd,ctx:input?.context_window?.used_percentage});
 // If install.mjs wrapped an existing status line, run it first and keep its output as is.
 const install=readJsonOr(join(HOME,'install.json'),{});
 const wrapped=install?.statusLine?.wrappedCommand;
 if(typeof wrapped==='string'&&wrapped){
  try{
   const r=spawnSync(wrapped,{shell:true,input:raw,encoding:'utf8',timeout:2000});
   const theirs=(r.stdout||'').replace(/\s+$/,'');
   if(r.error||r.status!==0)log('error',{session,why:'wrapped-status'});
   if(theirs)return `${theirs}\n${mine}`;
  }catch{log('error',{session,why:'wrapped-status'});}
 }
 return mine;
}

function readStdin(){
 let raw='';
 try{raw=readFileSync(0,'utf8');}catch{}
 try{return {raw,input:JSON.parse(raw||'{}')};}catch{return {raw,input:null};}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const mode=process.argv[2];
 const {raw,input}=readStdin();
 if(mode==='status'){
  if(!input)log('error',{why:'stdin'});
  let line=PET.sleeping+' reckon';
  try{line=status(input||{},raw);}catch{log('error',{why:'status'});}
  process.stdout.write(line+'\n');
 }else if(mode==='stop'){
  if(!input){log('error',{why:'stdin'});}
  else{
   try{const out=stop(input);if(out)process.stdout.write(JSON.stringify(out)+'\n');}
   catch{log('error',{session:input.session_id,why:'stop'});}
  }
 }
 process.exitCode=0;
}
