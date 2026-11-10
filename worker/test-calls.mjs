import worker from'./worker.js';import{ReckonRegistry}from'./identity-registry.js';import{callsByParticipant}from'./calls.js';import{renderAppPage,appResponse,CALLS_SCRIPT,CALLS_SCRIPT_HASH}from'./app-page.js';import{REPO_URL,SESSIONS_FACTS_HTML}from'./landing-page.js';import{createHash}from'node:crypto';import vm from'node:vm';import assert from'node:assert/strict';
// Synthetic fixtures only. calls.js stays an empty placeholder in the repo;
// real entries are injected at deploy time and never committed.
class Storage{constructor(){this.m=new Map();this.queue=Promise.resolve();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async transaction(fn){const r=this.queue.then(()=>fn(this));this.queue=r.catch(()=>{});return r;}}
let n=0;const pass=x=>{n++;console.log('PASS',x)};
const SRC='https://source.fixture.invalid/pr/7';
const XSS='<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
// The extractor caps quotes at 280 characters and marks a cut with a trailing " …".
const TRUNCATED=('Scope this release to the import flow only and leave the sharing work for the next cycle, because the sharing changes still need a review from the people who own the permissions model and we do not want to block the import fix on that conversation, which could take '.repeat(2)).slice(0,278)+' …';
const fixtures=()=>[
 {id:'call-1',type:'budget_cap',project:'fixture-app',date:'2026-10-03',quote:'Keep the monthly spend under the agreed cap.',status:'not_checked',outcome:null,check_target:{kind:'github_pr',locator:'fixture-org/fixture-app#12',basis:'PR mentioned in session'}},
 {id:'call-2',type:'merge_or_release_gate',project:'fixture-app',date:null,quote:'Do not merge until the migration test passes.',status:'checked',outcome:{text:'Checked 2026-11-02: the current code contains a migration test in the release workflow. Current state observed on that date, not proof about the original change.',source_url:SRC},check_target:{kind:'github_pr',locator:'fixture-org/fixture-app#14',basis:'PR mentioned in session'}},
 {id:'call-3',type:'verification_demand',project:'other-fixture',date:'2026-10-05',quote:'Show me the failing test before you change anything.',status:'not_checked',outcome:null,check_target:{kind:'none',locator:null,basis:'no target found'}},
 {id:'call-4',type:'launch_or_scope_call',project:'other-fixture',date:'2026-10-06',quote:TRUNCATED,status:'not_checked',outcome:null,check_target:{kind:'none',locator:null,basis:'no target found'}},
];
const section=html=>{const a=html.indexOf('<section id="calls"');return a<0?'':html.slice(a,html.indexOf('</section>',a)+10);};
const urls=html=>[...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m=>m[0]);
const page=calls=>renderAppPage({email:'a@fixture.invalid',reckonId:'rk_a',uploads:[],findings:[],calls});

// No calls: no calls section, no script, no script-src; a plain one-line state instead.
{const base=page([]);assert(!base.includes('Things you told your agents'));assert(!base.includes('<script'));assert(base.includes('Nothing is listed for your account yet.'));
 assert.equal(page([{id:'',quote:'x'},{id:'y'},null,'z']),base);
 assert(!appResponse({email:'a@fixture.invalid',reckonId:'rk_a',calls:[]}).headers.get('content-security-policy').includes('script-src'));
 assert(base.includes('What happens to your sessions')&&base.includes('<details>'));}
pass('no or malformed calls: plain empty state, no script, CSP unchanged, data facts still reachable');

// Route: the signed-in participant's calls come from calls.js via the same participant mapping as findings.
const s=new Storage(),reg=new ReckonRegistry({storage:s},{});const env={RECKON_REGISTRY:{idFromName:x=>x,get:()=>({fetch:(u,o)=>reg.fetch(new Request(u,o))})}};
const ctx=(p,email)=>({access:{getIdentity:async()=>({user_uuid:p,email})}});const get=c=>worker.fetch(new Request('https://test/browser/app'),env,c);
const a=await reg.identify({principal:'calls-a',email:'a@fixture.invalid'}),b=await reg.identify({principal:'calls-b',email:'b@fixture.invalid'});
{const r=await get(ctx(a.principal,a.email));assert.equal(r.status,200);assert(!(await r.text()).includes('Things you told your agents'));assert(!r.headers.get('content-security-policy').includes('script-src'));}
callsByParticipant[a.participant]=fixtures();
{const r=await get(ctx(a.principal,a.email));const html=await r.text();assert(html.includes('Things you told your agents'));assert(html.includes('Keep the monthly spend under the agreed cap.'));
 const csp=r.headers.get('content-security-policy');assert(csp.includes(`script-src '${CALLS_SCRIPT_HASH}'`));assert(csp.startsWith("default-src 'none'"));assert(!csp.includes('unsafe-inline\'; script'));
 const inline=html.match(/<script>([\s\S]*?)<\/script>/);assert.equal('sha256-'+createHash('sha256').update(inline[1]).digest('base64'),CALLS_SCRIPT_HASH);assert.equal((html.match(/<script/g)||[]).length,1);
 assert(html.includes(`data-account="${a.reckon_id}"`));assert(!html.replace(`data-account="${a.reckon_id}"`,'').includes(a.reckon_id),'Reckon ID only in the data attribute');}
{const html=await(await get(ctx(b.principal,b.email))).text();assert(!html.includes('Things you told your agents'));assert(!html.includes('monthly spend'));}
delete callsByParticipant[a.participant];
pass('route: own calls only, via participant mapping; CSP allows exactly the one inline script by hash');

// Rendering and wording.
{const sec=section(page(fixtures()));
 assert(sec.includes('<h1 id="calls-title">Things you told your agents</h1>'));
 assert(sec.includes('Picked from your upload by a rule pass, then read through by hand.'));
 assert(sec.includes('<span class="m">fixture-app &middot; 3 Oct 2026</span>'));assert(sec.includes('<span class="m">fixture-app &middot; date unclear</span>'));
 for(const l of ['Budget or limit','Merge or release gate','Asked for proof','Scope call','Go-ahead'])assert(!sec.includes(l),`type label ${l} shown`);
 assert(sec.includes('Where to check: <code>fixture-org/fixture-app#12</code>'));assert(!sec.includes('fixture-org/fixture-app#14'),'checked entries show the outcome, not the locator');
 assert(sec.includes('Checked 2026-11-02: the current code contains a migration test in the release workflow. Current state observed on that date, not proof about the original change.'));
 assert(sec.includes(`<a href="${SRC}" rel="noopener noreferrer">Source</a>`));assert.equal((sec.match(/<a /g)||[]).length,1);
 assert(sec.includes('no outcome check is recorded here; you may have checked elsewhere.'));
 assert.equal((sec.match(/type="checkbox"/g)||[]).length,4);assert(sec.includes('<div id="keep" class="keep" hidden>'));
 assert(sec.includes(`<span class="q">${TRUNCATED.slice(0,-2)} …</span>`));assert(!sec.includes(' …</span>'));
 const mid=section(page([{...fixtures()[0],quote:'Ends with an ellipsis mid … sentence'}]));assert(mid.includes('mid … sentence'));
 // Wording discipline: candidates, no outcome-tracking premise, no automation or other-user claims, nothing gamified.
 const html=page(fixtures()).replace(SESSIONS_FACTS_HTML,'').replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g,'').toLowerCase();
 for(const w of ['mark reviewed','nobody has looked','went wrong','did it hold up','follow up','follow-up','forgot','never check','analy','automatic','every upload','other users','most people','score','streak','progress','%'])assert(!html.includes(w),`"${w}" on the page`);
 assert(!/[–—]/.test(sec));
 const legacy=section(page([{...fixtures()[2],status:'open'}]));assert(!legacy.includes('Checked'));
 const noOutcome=section(page([{...fixtures()[1],outcome:null}]));assert(noOutcome.includes('Where to check:'));}
pass('rendering: own words first, project and date only, plain-text locator, https-only Source, exact not-checked wording, truncation kept inline');

// The re-selected entries: standing instructions with only id, project, date and quote.
const standing=()=>[
 {id:'si-1',project:'fixture-app',date:'2026-10-03',quote:'Show me the failing test before you change anything.'},
 {id:'si-2',project:'fixture-app',date:null,quote:'Run the full test suite before you say a change is done.'},
 {id:'si-3',date:'2026-10-08',quote:'Ask before adding a new dependency.'},
];
{const sec=section(page(standing()));
 assert.equal((sec.match(/type="checkbox"/g)||[]).length,3);
 assert(sec.includes('<span class="m">fixture-app &middot; 3 Oct 2026</span>'));assert(sec.includes('<span class="m">fixture-app &middot; date unclear</span>'));assert(sec.includes('<span class="m">8 Oct 2026</span>'));
 assert(!sec.includes('class="x"'),'no outcome or check line without that data');assert(!sec.includes('Where to check'));assert(!sec.includes('Checked'));
 assert(!sec.includes('class="fine"'),'no outcome fine print when no entry carries an outcome');assert(!/outcome/i.test(sec.replace(/<script>[\s\S]*?<\/script>/,'')));
 // Mixed: fine print appears only once some entry carries an observed outcome.
 assert(!section(page([...standing(),fixtures()[0]])).includes('class="fine"'),'a locator alone does not bring the fine print');
 const mixed=section(page([...standing(),fixtures()[1]]));assert(mixed.includes('class="fine"'));assert.equal((mixed.match(/class="fine"/g)||[]).length,1);}
pass('standing-instruction entries: quote plus project and date only; outcome fine print only when an entry carries an outcome');

// Escaping.
{const html=renderAppPage({email:XSS,reckonId:XSS,calls:[{id:XSS,type:XSS,project:XSS,date:XSS,quote:XSS,status:'checked',outcome:{text:XSS,source_url:'javascript:alert(3)'},check_target:{kind:'github_pr',locator:XSS,basis:XSS}},{id:'c2',type:'go_ahead',project:'p',date:null,quote:'q',status:'not_checked',outcome:null,check_target:{kind:'github_pr',locator:XSS,basis:'b'}}]});
 assert(!html.includes('<script>alert'));assert(!html.includes('<img src=x'));assert(!html.includes('javascript:'));
 assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(html.includes('data-call-id="&lt;script&gt;'));assert(html.includes('data-project="&lt;script&gt;'));assert(html.includes('data-account="&lt;script&gt;'));
 assert.equal((html.match(/<script/g)||[]).length,1);}
pass('every dynamic value escaped (XSS probe), including attributes and the email');

// URLs: only the allowlisted outcome source is linked; locators and http sources never are.
{const html=page([...fixtures(),{...fixtures()[1],id:'c5',outcome:{text:'Checked 2026-11-03: the current code contains a flag. Current state observed on that date, not proof about the original change.',source_url:'http://plain.fixture.invalid/x'}},{...fixtures()[0],id:'c6',check_target:{kind:'github_pr',locator:'https://github.com/fixture-org/fixture-app/pull/9',basis:'b'}}]);
 const sec=section(html);
 assert.deepEqual([...new Set([...sec.matchAll(/href="([^"]+)"/g)].map(m=>m[1]))],[SRC]);
 assert.deepEqual([...new Set(urls(sec.replace(/<code>[^<]*<\/code>/g,'')))],[SRC]);
 for(const u of urls(html))assert([SRC,REPO_URL].includes(u)||u.startsWith('https://github.com/fixture-org/'),`unexpected URL ${u}`);}
pass('no URLs except the allowlisted https outcome source; locators never linked');

// Script: no network APIs; builds the paste text; remembers ticks per account + entry.
for(const re of [/fetch/,/XMLHttpRequest/,/sendBeacon/,/WebSocket/,/EventSource/,/import\(/,/\beval\b/,/new Function/,/https?:/,/document\.cookie/,/innerHTML/])assert(!re.test(CALLS_SCRIPT),`${re} in script`);
function run(account,store,rowsSpec=[['call-1','fixture-app','Keep the monthly spend under the agreed cap.'],['call-4','other-fixture','Scope it to imports …']]){
 const clip=[];const listeners=o=>(o.l={},o.addEventListener=(t,f)=>{o.l[t]=f},o);
 const rows=rowsSpec.map(([id,project,q])=>{const cb=listeners({checked:false});const li={attrs:{'data-call-id':id,'data-project':project},cls:new Set(),cb,getAttribute:k=>li.attrs[k]??null,classList:{toggle:(c,on)=>on?li.cls.add(c):li.cls.delete(c)},querySelector:sel=>sel==='.q'?{textContent:q}:cb};return li;});
 const root={attrs:account?{'data-account':account}:{},getAttribute:k=>root.attrs[k]??null,querySelectorAll:()=>rows};
 const panel={hidden:true},out={value:'',selected:false,select(){this.selected=true}},btn=listeners({textContent:''});
 const document={documentElement:{className:''},getElementById:id=>({calls:root,keep:panel,'keep-text':out,'keep-copy':btn})[id]??null,execCommand:()=>false};
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const navigator={clipboard:{writeText:t=>{clip.push(t);return Promise.resolve();}}};
 vm.runInNewContext(CALLS_SCRIPT,{document,localStorage,navigator});return{rows,panel,out,btn,clip,document};
}
{const store=new Map();
 let A=run('rk_A',store);assert(A.document.documentElement.className.includes('js'));assert.equal(A.panel.hidden,true);assert.equal(A.out.value,'');
 A.rows[0].cb.checked=true;A.rows[0].cb.l.change();A.rows[1].cb.checked=true;A.rows[1].cb.l.change();
 assert.equal(A.panel.hidden,false);assert.equal(A.out.value,'- Keep the monthly spend under the agreed cap. (fixture-app)\n- Scope it to imports … (other-fixture)');assert(A.rows[0].cls.has('on'));
 assert.equal(store.get('reckon.keep.v1:rk_A:call-1'),'1');assert.equal(store.get('reckon.keep.v1:rk_A:call-4'),'1');
 A.btn.l.click();await new Promise(r=>setImmediate(r));assert.deepEqual(A.clip,[A.out.value]);assert.equal(A.btn.textContent,'Copied');
 A=run('rk_A',store);assert(A.rows[0].cb.checked&&A.rows[1].cb.checked,'ticks persist for the same account');assert.equal(A.panel.hidden,false);
 const B=run('rk_B',store);assert(!B.rows[0].cb.checked&&!B.rows[1].cb.checked,'another account never inherits ticks');assert.equal(B.panel.hidden,true);
 A.rows[0].cb.checked=false;A.rows[0].cb.l.change();assert(!store.has('reckon.keep.v1:rk_A:call-1'),'unticking removes the key');assert.equal(A.out.value,'- Scope it to imports … (other-fixture)');
 A.rows[1].cb.checked=false;A.rows[1].cb.l.change();assert.equal(A.panel.hidden,true);
 const before=store.size;const N=run(null,store);N.rows[0].cb.checked=true;N.rows[0].cb.l.change();assert.equal(N.out.value,'- Keep the monthly spend under the agreed cap. (fixture-app)','works without an account id');assert.equal(store.size,before,'but remembers nothing');
 assert.deepEqual([...store.keys()],[]);}
pass('script: tick to gather your own words into an editable box, copy without network, ticks kept per account and entry only');

console.log(n,'calls checks PASS');
