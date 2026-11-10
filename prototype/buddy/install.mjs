#!/usr/bin/env node
// Installs or removes the Reckon buddy for Claude Code. Node only, no
// dependencies, no network.
//
//   node install.mjs              asks which starter rules to switch on, copies
//                                 the buddy to ~/.reckon/, and merges two
//                                 entries into ~/.claude/settings.json
//   node install.mjs --uninstall  removes only those entries
//
// ~/.claude/settings.json is backed up to a timestamped file before it is
// changed. Existing entries are never silently overwritten.
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';

const SRC=dirname(fileURLToPath(import.meta.url));
const HOME=process.env.HOME||homedir();
const RECKON=join(HOME,'.reckon');
const CLAUDE=join(HOME,'.claude');
const SETTINGS=join(CLAUDE,'settings.json');
const INSTALL_INFO=join(RECKON,'install.json');
const MARK='.reckon/buddy.mjs';
const STATUS_CMD=`node "${join(RECKON,'buddy.mjs')}" status`;
const STOP_CMD=`node "${join(RECKON,'buddy.mjs')}" stop`;
const isOurs=c=>typeof c==='string'&&c.includes(MARK);

const say=s=>process.stdout.write(s+'\n');

// Answers come from the terminal, or from piped input (used by the tests).
function asker(){
 const rl=createInterface({input:process.stdin,terminal:false});
 const queue=[],waiting=[];let closed=false;
 rl.on('line',l=>{const w=waiting.shift();if(w)w(l);else queue.push(l);});
 rl.on('close',()=>{closed=true;while(waiting.length)waiting.shift()('');});
 return {
  ask(q){process.stdout.write(q);if(queue.length)return Promise.resolve(queue.shift());if(closed)return Promise.resolve('');return new Promise(r=>waiting.push(r));},
  close(){rl.close();},
 };
}
const yes=(answer,dflt)=>{const a=String(answer||'').trim().toLowerCase();return a?a==='y'||a==='yes':dflt;};

function readSettings(){
 if(!existsSync(SETTINGS))return {exists:false,data:{}};
 const text=readFileSync(SETTINGS,'utf8');
 let data;
 try{data=text.trim()?JSON.parse(text):{};}catch{throw new Error(`${SETTINGS} is not valid JSON. Nothing was changed. Fix it, then run this again.`);}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(`${SETTINGS} does not hold a JSON object. Nothing was changed.`);
 if(data.hooks!==undefined&&(!data.hooks||typeof data.hooks!=='object'||Array.isArray(data.hooks)))throw new Error(`"hooks" in ${SETTINGS} is not an object. Nothing was changed.`);
 if(data.hooks?.Stop!==undefined&&!Array.isArray(data.hooks.Stop))throw new Error(`"hooks.Stop" in ${SETTINGS} is not a list. Nothing was changed.`);
 return {exists:true,data};
}

function backup(){
 if(!existsSync(SETTINGS))return null;
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'').replace('T','-')+'-'+process.pid;
 const path=`${SETTINGS}.reckon-backup-${stamp}`;
 copyFileSync(SETTINGS,path);
 return path;
}

function writeSettings(data){mkdirSync(CLAUDE,{recursive:true});writeFileSync(SETTINGS,JSON.stringify(data,null,2)+'\n');}
const readInfo=()=>{try{return JSON.parse(readFileSync(INSTALL_INFO,'utf8'));}catch{return {};}};

async function chooseRules(a){
 const starter=JSON.parse(readFileSync(join(SRC,'rules.default.json'),'utf8'));
 let current=null;
 try{current=JSON.parse(readFileSync(join(RECKON,'rules.json'),'utf8'));}catch{}
 const mine=new Map((Array.isArray(current?.rules)?current.rules:[]).filter(r=>r&&r.id).map(r=>[r.id,r]));
 say('');
 say('The owl speaks only for rules you switch on here - a few times per session at');
 say('most, with a pause between, and never the same rule twice in a session.');
 say('These are starter suggestions, not findings about you. You can reword or');
 say(`switch any of them later in ${join(RECKON,'rules.json')}.`);
 const rules=[];
 for(const [i,r] of starter.rules.entries()){
  const existing=mine.get(r.id),merged={...r,...(existing||{})},on=existing?.enabled===true;
  say('');
  say(`[${i+1}/${starter.rules.length}] ${r.id}`);
  say(`  when: ${merged.description}`);
  say(`  the owl says: "${merged.says}"`);
  merged.enabled=yes(await a.ask(`  switch on? ${on?'[Y/n]':'[y/N]'} `),on);
  rules.push(merged);
 }
 // Keep any rules the user added by hand.
 for(const [id,r] of mine)if(!starter.rules.some(s=>s.id===id))rules.push(r);
 // Keep hand-tuned limits; new installs get the starter defaults.
 const out={...starter,rules};
 if(current?.limits&&typeof current.limits==='object')out.limits=current.limits;
 return out;
}

async function install(){
 const {exists,data}=readSettings(); // throws before anything is touched
 const a=asker();
 try{
  const rules=await chooseRules(a);
  mkdirSync(RECKON,{recursive:true});
  copyFileSync(join(SRC,'buddy.mjs'),join(RECKON,'buddy.mjs'));
  writeFileSync(join(RECKON,'rules.json'),JSON.stringify(rules,null,2)+'\n');
  const backupPath=backup();
  const info=readInfo(),added=[],kept=[];

  // statusLine holds a single command, so it can only be added, wrapped or replaced.
  const sl=data.statusLine;
  if(sl===undefined){
   data.statusLine={type:'command',command:STATUS_CMD};
   added.push(`statusLine: ${STATUS_CMD}`);
  }else if(sl&&typeof sl==='object'&&isOurs(sl.command)){
   kept.push('statusLine: already the owl, left as is');
  }else if(sl&&typeof sl==='object'&&sl.type==='command'&&typeof sl.command==='string'&&sl.command.trim()){
   info.statusLine={original:sl,wrappedCommand:sl.command};
   data.statusLine={...sl,command:STATUS_CMD};
   added.push(`statusLine: now ${STATUS_CMD}`);
   added.push(`  it still runs your previous command first and prints its output unchanged: ${sl.command}`);
   added.push('  the owl appears on its own line below it; --uninstall puts your original back');
  }else{
   say('');
   say('Your settings already have a statusLine the owl cannot safely wrap:');
   say('  '+JSON.stringify(sl));
   say(`It is saved in ${backupPath||'the backup'} and would be restored on --uninstall.`);
   if(yes(await a.ask('Replace it with the owl\'s status line? [y/N] '),false)){
    info.statusLine={original:sl,wrappedCommand:null};
    data.statusLine={type:'command',command:STATUS_CMD};
    added.push(`statusLine: replaced with ${STATUS_CMD} (your previous one is in the backup)`);
   }else{
    kept.push('statusLine: yours, unchanged; the owl will only speak through the Stop hook');
   }
  }

  // Stop hooks are a list: append ours once, keep everything else.
  data.hooks=data.hooks||{};
  const groups=data.hooks.Stop||[];
  let seen=false;
  for(const g of groups)if(g&&Array.isArray(g.hooks))g.hooks=g.hooks.filter(h=>{if(!isOurs(h?.command))return true;if(seen)return false;seen=true;return true;});
  const cleaned=groups.filter(g=>!(g&&Array.isArray(g.hooks)&&g.hooks.length===0));
  if(seen){kept.push('Stop hook: already present, left as is');}
  else{cleaned.push({hooks:[{type:'command',command:STOP_CMD}]});added.push(`hooks.Stop: ${STOP_CMD}`);}
  data.hooks.Stop=cleaned;

  writeSettings(data);
  mkdirSync(RECKON,{recursive:true});
  writeFileSync(INSTALL_INFO,JSON.stringify(info,null,2)+'\n');

  const on=rules.rules.filter(r=>r.enabled===true).map(r=>r.id);
  say('');
  say(exists?`Backed up ${SETTINGS} to ${backupPath}`:`Created ${SETTINGS} (there was none before)`);
  if(added.length){say('Added to settings:');for(const l of added)say('  '+l);}else say('Added to settings: nothing new');
  if(kept.length){say('Left alone:');for(const l of kept)say('  '+l);}
  say(`Rules switched on: ${on.length?on.join(', '):'none (the owl will stay quiet until you switch one on)'}`);
  say(`Edit rules any time: ${join(RECKON,'rules.json')}`);
  say(`Log: ${join(RECKON,'buddy.log')}`);
  say('Restart Claude Code to see the owl. Remove it with: node install.mjs --uninstall');
 }finally{a.close();}
}

function uninstall(){
 const {exists,data}=readSettings();
 if(!exists){say(`No ${SETTINGS}; nothing to remove.`);return;}
 const backupPath=backup();
 const info=readInfo(),removed=[];
 if(data.statusLine&&isOurs(data.statusLine.command)){
  if(info.statusLine?.original){data.statusLine=info.statusLine.original;removed.push('statusLine: restored your previous status line');}
  else{delete data.statusLine;removed.push('statusLine: removed');}
 }
 const groups=data.hooks&&Array.isArray(data.hooks.Stop)?data.hooks.Stop:null;
 if(groups){
  let n=0;
  for(const g of groups)if(g&&Array.isArray(g.hooks)){const before=g.hooks.length;g.hooks=g.hooks.filter(h=>!isOurs(h?.command));n+=before-g.hooks.length;}
  const left=groups.filter(g=>!(g&&Array.isArray(g.hooks)&&g.hooks.length===0));
  if(n)removed.push(`hooks.Stop: removed ${n} owl entr${n===1?'y':'ies'}`);
  if(left.length)data.hooks.Stop=left;else delete data.hooks.Stop;
  if(Object.keys(data.hooks).length===0)delete data.hooks;
 }
 writeSettings(data);
 if(existsSync(INSTALL_INFO))rmSync(INSTALL_INFO);
 say(`Backed up ${SETTINGS} to ${backupPath}`);
 if(removed.length){say('Removed from settings:');for(const l of removed)say('  '+l);}else say('No owl entries were found in settings; nothing else changed.');
 say(`Your rules and log are still in ${RECKON}. Delete that folder if you want them gone too.`);
}

try{
 if(process.argv.includes('--uninstall'))uninstall();
 else await install();
}catch(e){
 say(`Stopped: ${e.message}`);
 process.exitCode=1;
}
