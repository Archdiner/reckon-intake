import worker from'./worker.js';import{ReckonRegistry}from'./identity-registry.js';import{callsByParticipant}from'./calls.js';import{renderAppPage,appResponse,CALLS_SCRIPT,CALLS_SCRIPT_HASH}from'./app-page.js';import{REPO_URL}from'./landing-page.js';import{createHash}from'node:crypto';import vm from'node:vm';import assert from'node:assert/strict';
// Synthetic fixtures only. calls.js stays an empty placeholder in the repo;
// real entries are injected at deploy time and never committed.
class Storage{constructor(){this.m=new Map();this.queue=Promise.resolve();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async transaction(fn){const r=this.queue.then(()=>fn(this));this.queue=r.catch(()=>{});return r;}}
let n=0;const pass=x=>{n++;console.log('PASS',x)};
const SRC='https://source.fixture.invalid/pr/7';
// The extractor caps quotes at 280 characters and marks a cut with a trailing " …".
const TRUNCATED=('Scope this release to the import flow only and leave the sharing work for the next cycle, because the sharing changes still need a review from the people who own the permissions model and we do not want to block the import fix on that conversation, which could take '.repeat(2)).slice(0,278)+' …';
const XSS='<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
const fixtures=()=>[
 {id:'call-1',type:'budget_cap',project:'fixture-app',date:'2026-10-03',quote:'Keep the monthly spend under the agreed cap.',status:'not_checked',outcome:null,check_target:{kind:'github_pr',locator:'fixture-org/fixture-app#12',basis:'PR mentioned in session'}},
 {id:'call-2',type:'merge_or_release_gate',project:'fixture-app',date:null,quote:'Do not merge until the migration test passes.',status:'checked',outcome:{text:'Checked 2026-11-02: the current code contains a migration test in the release workflow. Current state observed on that date, not proof about the original change.',source_url:SRC},check_target:{kind:'github_pr',locator:'fixture-org/fixture-app#14',basis:'PR mentioned in session'}},
 {id:'call-3',type:'verification_demand',project:'other-fixture',date:'2026-10-05',quote:'Show me the failing test before you change anything.',status:'not_checked',outcome:null,check_target:{kind:'none',locator:null,basis:'no target found'}},
 {id:'call-4',type:'launch_or_scope_call',project:'other-fixture',date:'2026-10-06',quote:TRUNCATED,status:'not_checked',outcome:null,check_target:{kind:'none',locator:null,basis:'no target found'}},
];
const section=html=>{const a=html.indexOf('<section aria-labelledby="calls"');return a<0?'':html.slice(a,html.indexOf('</section>',a)+10);};
const urls=html=>[...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m=>m[0]);

// No calls: no section, no script, no script-src in the CSP; page identical to before.
{const base=renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',uploads:[],findings:[]});assert.equal(renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',uploads:[],findings:[],calls:[]}),base);assert(!base.includes('Calls we noticed'));assert(!base.includes('<script'));
 const r=appResponse({email:'a@fixture.invalid',reckonId:'rk_a',calls:[]});assert(!r.headers.get('content-security-policy').includes('script-src'));
 assert.equal(renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',calls:[{id:'',quote:'x'},{id:'y'},null,'z']}),base);}
pass('empty or malformed calls render nothing; page and CSP unchanged');

// Route: the signed-in participant's calls come from calls.js via the same participant mapping as findings.
const s=new Storage(),reg=new ReckonRegistry({storage:s},{});const env={RECKON_REGISTRY:{idFromName:x=>x,get:()=>({fetch:(u,o)=>reg.fetch(new Request(u,o))})}};
const ctx=(p,email)=>({access:{getIdentity:async()=>({user_uuid:p,email})}});const get=(p,c)=>worker.fetch(new Request('https://test/browser/app'),env,c);
const a=await reg.identify({principal:'calls-a',email:'a@fixture.invalid'}),b=await reg.identify({principal:'calls-b',email:'b@fixture.invalid'});
{const r=await get('/browser/app',ctx(a.principal,a.email));const html=await r.text();assert.equal(r.status,200);assert(!html.includes('Calls we noticed'));assert(!r.headers.get('content-security-policy').includes('script-src'));}
callsByParticipant[a.participant]=fixtures();
{const r=await get('/browser/app',ctx(a.principal,a.email));const html=await r.text();assert(html.includes('Calls we noticed in your sessions'));assert(html.includes('Keep the monthly spend under the agreed cap.'));
 const csp=r.headers.get('content-security-policy');assert(csp.includes(`script-src '${CALLS_SCRIPT_HASH}'`));assert(csp.startsWith("default-src 'none'"));
 const inline=html.match(/<script>([\s\S]*?)<\/script>/);assert.equal('sha256-'+createHash('sha256').update(inline[1]).digest('base64'),CALLS_SCRIPT_HASH);assert.equal((html.match(/<script/g)||[]).length,1);
 assert(html.includes(`data-account="${a.reckon_id}"`));}
{const html=await(await get('/browser/app',ctx(b.principal,b.email))).text();assert(!html.includes('Calls we noticed'));assert(!html.includes('monthly spend'));}
delete callsByParticipant[a.participant];
pass('route: own calls only, via participant mapping; CSP allows exactly the one inline script by hash');

// Rendering: labels, dates, statuses, locator as plain text, https-only Source link.
{const html=renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',calls:fixtures()});const sec=section(html);
 assert(sec.includes('Budget or limit')&&sec.includes('Merge or release gate')&&sec.includes('Asked for proof'));
 assert(sec.includes('3 October 2026'));assert(sec.includes('date unclear'));
 assert(sec.includes('Not checked. <span class="where">Where to check: <code>fixture-org/fixture-app#12</code></span>'));
 assert(!sec.includes('fixture-org/fixture-app#14'),'checked entries show the outcome, not the locator');
 assert(sec.includes('Checked 2026-11-02: the current code contains a migration test in the release workflow. Current state observed on that date, not proof about the original change.'));
 assert(sec.includes(`<a href="${SRC}" rel="noopener noreferrer">Source</a>`));
 assert.equal((sec.match(/<a /g)||[]).length,1);
 assert(sec.includes('treat these as candidates'));assert(sec.includes('No outcome check is recorded here; you may have checked elsewhere.'));assert(!sec.includes('nobody has looked'));
 assert(sec.includes('Marks stay on this device, in this browser.'));
 assert(!/\bopen\b/i.test(sec.replace(/noopener/g,'')),'no "open" status wording');
 assert(!/analy[sz]e (your|future)|every upload|automatically/i.test(html),'no claim of automatic or ongoing analysis');
 assert(!/[–—]/.test(sec));
 // Anything other than 'checked' (including a stray legacy value) shows as Not checked.
 const legacy=section(renderAppPage({email:'x',reckonId:'rk_a',calls:[{...fixtures()[2],status:'open'}]}));assert(legacy.includes('Not checked.'));
 const noOutcome=section(renderAppPage({email:'x',reckonId:'rk_a',calls:[{...fixtures()[1],outcome:null}]}));assert(noOutcome.includes('Not checked.'));}
assert.equal(TRUNCATED.length,280);
{const sec=section(renderAppPage({email:'x',reckonId:'rk_a',calls:fixtures()}));assert(sec.includes(`<blockquote class="call-quote">${TRUNCATED.slice(0,-2)}\u00a0\u2026</blockquote>`),'truncated quote keeps its text; the trailing " …" is joined with a no-break space');assert(!sec.includes(' \u2026</blockquote>'));
 const plainEnd=section(renderAppPage({email:'x',reckonId:'rk_a',calls:[{...fixtures()[0],quote:'Ends with an ellipsis mid … sentence'}]}));assert(plainEnd.includes('mid … sentence'),'only a trailing marker is touched');assert(sec.includes('Scope call'));}
pass('labels, dates, Not checked with plain-text locator, checked outcome with Source link, truncated quote kept as given');

// Escaping: an XSS probe in every dynamic field stays inert.
{const html=renderAppPage({email:'a@fixture.invalid',reckonId:XSS,calls:[{id:XSS,type:XSS,project:XSS,date:XSS,quote:XSS,status:'checked',outcome:{text:XSS,source_url:'javascript:alert(3)'},check_target:{kind:'github_pr',locator:XSS,basis:XSS}},{id:'c2',type:'go_ahead',project:'p',date:null,quote:'q',status:'not_checked',outcome:null,check_target:{kind:'github_pr',locator:XSS,basis:'b'}}]});const sec=section(html);
 assert(!sec.includes('<script>alert'));assert(!sec.includes('<img'));assert(!sec.includes('onerror=alert(2)>'));assert(!html.includes('javascript:'));
 assert(sec.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(sec.includes('data-call-id="&lt;script&gt;'));assert(sec.includes('data-account="&lt;script&gt;'));
 assert.equal((html.match(/<script/g)||[]).length,1);}
pass('quotes and every other dynamic value escaped (XSS probe)');

// URLs: nothing but the allowlisted outcome source in the calls section; http and odd schemes are never linked.
{const html=renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',calls:[...fixtures(),{...fixtures()[1],id:'c4',outcome:{text:'Checked 2026-11-03: the current code contains a flag. Current state observed on that date, not proof about the original change.',source_url:'http://plain.fixture.invalid/x'}},{...fixtures()[0],id:'c5',check_target:{kind:'github_pr',locator:'https://github.com/fixture-org/fixture-app/pull/9',basis:'b'}}]});
 const sec=section(html);
 assert.deepEqual([...new Set([...sec.matchAll(/href="([^"]+)"/g)].map(m=>m[1]))],[SRC]);
 const plain=sec.replace(/<code>[^<]*<\/code>/g,'');assert.deepEqual([...new Set(urls(plain))],[SRC]);
 assert(!sec.includes('href="http://plain'));
 for(const u of urls(html))assert([SRC,REPO_URL].includes(u)||u.startsWith('https://github.com/fixture-org/'),`unexpected URL ${u}`);}
pass('no URLs except the allowlisted https outcome source; locators never linked');

// Script: no network, keys scoped to account + entry, marks never leak across accounts.
for(const re of [/fetch/,/XMLHttpRequest/,/sendBeacon/,/WebSocket/,/EventSource/,/import\(/,/\beval\b/,/new Function/,/https?:/,/document\.cookie/,/innerHTML/])assert(!re.test(CALLS_SCRIPT),`${re} in script`);
function runScript(account,store){
 const el=(attrs={})=>{const e={attrs,hidden:attrs.hidden??false,classes:new Set(),textContent:'',listeners:{},getAttribute:k=>e.attrs[k]??null,setAttribute:(k,v)=>{e.attrs[k]=v},addEventListener:(t,f)=>{e.listeners[t]=f},classList:{toggle:(c,on)=>on?e.classes.add(c):e.classes.delete(c)}};return e;};
 const items=['call-1','call-2'].map(id=>{const li=el({'data-call-id':id});li.button=el({hidden:true});li.querySelector=()=>li.button;return li;});
 const sec=el(account?{'data-account':account}:{});sec.querySelectorAll=()=>items;const note=el({hidden:true});
 const document={getElementById:id=>id==='calls-section'?sec:id==='calls-local-note'?note:null};
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 vm.runInNewContext(CALLS_SCRIPT,{document,localStorage});return{items,note};
}
{const store=new Map();
 let A=runScript('rk_A',store);assert(A.items.every(li=>li.button.hidden===false));assert.equal(A.note.hidden,false);
 A.items[0].button.listeners.click();assert.equal(store.get('reckon.reviewed.v1:rk_A:call-1'),'1');assert(A.items[0].classes.has('reviewed'));assert.equal(A.items[0].button.textContent,'Reviewed');assert.equal(A.items[0].button.attrs['aria-pressed'],'true');assert(!A.items[1].classes.has('reviewed'));
 A=runScript('rk_A',store);assert(A.items[0].classes.has('reviewed'),'mark persists for the same account');
 const B=runScript('rk_B',store);assert(!B.items[0].classes.has('reviewed'),'another account never inherits marks');assert.equal(B.items[0].button.textContent,'Mark reviewed');
 A.items[0].button.listeners.click();assert(!store.has('reckon.reviewed.v1:rk_A:call-1'),'unmarking removes the key');
 const none=runScript(null,store);assert(none.items.every(li=>li.button.hidden===true),'no account id: no buttons, nothing stored');assert.equal(none.note.hidden,true);
 assert.deepEqual([...store.keys()],[]);}
pass('reviewed marks: keyed by Reckon ID + entry id, isolated per account, no network APIs in the script');

console.log(n,'calls checks PASS');
