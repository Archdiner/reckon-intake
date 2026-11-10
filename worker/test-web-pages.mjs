import worker from'./worker.js';import launcher from'./launcher.js';import{ReckonRegistry,OWNER}from'./identity-registry.js';import{acceptedHistory}from'./accepted-history.js';import{findingsByParticipant}from'./findings.js';import{LANDING_PAGE,INSTALL_COMMAND,SESSIONS_FACTS_HTML}from'./landing-page.js';import{renderAppPage}from'./app-page.js';import assert from'node:assert/strict';
// Synthetic fixtures only. accepted-history.js and findings.js stay empty in the
// repo; this suite fills them in memory to simulate deploy-time injection.
class Storage{constructor(){this.m=new Map();this.queue=Promise.resolve();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async transaction(fn){const r=this.queue.then(()=>fn(this));this.queue=r.catch(()=>{});return r;}}
const s=new Storage(),reg=new ReckonRegistry({storage:s},{});let budget=0;const realBudget=reg.requestBudget.bind(reg);reg.requestBudget=v=>{budget++;return realBudget(v);};
const env={RECKON_REGISTRY:{idFromName:n=>n,get:()=>({fetch:(u,o)=>reg.fetch(new Request(u,o))})}};
const ctx=(p,email)=>({access:{getIdentity:async()=>({user_uuid:p,email})}});
const get=(path,context={},e=env)=>worker.fetch(new Request('https://test'+path),e,context);
let n=0;const pass=x=>{n++;console.log('PASS',x)};
// Landing copy rules.
const banned=['seamless','empower','delve','leverage','unlock','supercharge','ai-powered','revolutionize','game-changer','cutting-edge','robust','holistic','journey',"in today's fast-paced world"];
const text=LANDING_PAGE.toLowerCase();for(const w of banned)assert(!text.includes(w),'banned word '+w);assert(!/[–—]/.test(LANDING_PAGE));assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(LANDING_PAGE));assert(!/<script|https?:\/\/(?!reckon-intake\.aarizvi06\.workers\.dev\/install\.sh|github\.com\/Archdiner\/reckon-intake")/.test(LANDING_PAGE));
assert(LANDING_PAGE.includes('<code>'+INSTALL_COMMAND+'</code>'));assert.equal(INSTALL_COMMAND,'curl -fsSL https://reckon-intake.aarizvi06.workers.dev/install.sh | bash');assert(LANDING_PAGE.includes('href="/browser/app"'));
for(const tool of ['Claude Code','Codex','Cursor','Gemini','Antigravity','OpenCode','VS Code Copilot','Pi'])assert(LANDING_PAGE.includes(tool));pass('landing copy: command, sign-in link, supported tools, no banned words, dashes, emoji, scripts or external assets');
// Backend: / is HTML, /health JSON unchanged, /browser/ unchanged.
{const r=await get('/');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.equal(await r.text(),LANDING_PAGE);}
{const r=await get('/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{service:'private-coding-session-intake',version:1,authenticated_upload_required:true,archive_limit_bytes:512*1024**2,chunk_bytes:3*1024**2,max_sessions:50});}
assert.equal((await get('/browser/')).status,401);assert.equal((await get('/nope')).status,404);pass('backend: / serves landing HTML, /health JSON unchanged, other routes unchanged');
// Launcher.
const L=path=>launcher.fetch(new Request('https://reckon-intake.example'+path));
{const r=await L('/');assert.equal(r.status,200);assert.equal(await r.text(),LANDING_PAGE);}
for(const path of ['/install.sh','/reckon-wordmark.svg','/health','/browser/app','/browser/identity','/browser/login']){const r=await L(path);assert.equal(r.status,302,path);assert.equal(r.headers.get('location'),'https://paxel-intake.aarizvi06.workers.dev'+path);}
assert.equal((await L('/other')).status,404);assert.equal((await L('/browser')).status,404);assert.equal((await launcher.fetch(new Request('https://reckon-intake.example/browser/app',{method:'POST',body:'x'}))).status,404);pass('launcher: / landing, existing redirects kept, GET /browser/* redirected, others 404');
// /browser/app requires Access identity, like the other /browser/* GETs.
assert.equal((await get('/browser/app')).status,401);assert.equal(s.m.size,0);
assert.equal((await get('/browser/app',ctx('',''))).status,403);
assert.equal((await get('/browser/app',ctx('revoked','r@fixture.invalid'),{...env,REVOKED_PRINCIPALS:'["revoked"]'})).status,403);pass('/browser/app fails closed without verified identity; revoked denied');
// Two participants with uploads; each sees only their own.
const a=await reg.identify({principal:'app-a',email:'a@fixture.invalid'}),b=await reg.identify({principal:'app-b',email:'b@fixture.invalid'});
await reg.reserveBatch({principal:a.principal,digest:'a'.repeat(64),size:2048});await reg.beginCommit({principal:a.principal,digest:'a'.repeat(64)});await reg.markAccepted({principal:a.principal,digest:'a'.repeat(64)});
await reg.reserveBatch({principal:b.principal,digest:'b'.repeat(64),size:777});
acceptedHistory.push({participant:a.participant,digest:'c'.repeat(64),size:5*1024**2,accepted_at:'2026-10-01T00:00:00.000Z'},{participant:b.participant,digest:'d'.repeat(64),size:999,accepted_at:'2026-10-02T00:00:00.000Z'});
{const list=await reg.listUploads({principal:a.principal});assert.equal(list.length,2);assert(list.every(x=>Object.keys(x).sort().join()==='date,size,status'));assert.deepEqual(list.map(x=>[x.size,x.status]).sort(),[[2048,'accepted'],[5*1024**2,'accepted']]);
 const lb=await reg.listUploads({principal:b.principal});assert.deepEqual(lb.map(x=>[x.size,x.status]).sort(),[[777,'reserved'],[999,'accepted']]);}
await assert.rejects(reg.listUploads({principal:'unknown'}),/Account not active/);await assert.rejects(reg.listUploads({}),/identity missing/);
{const r=await reg.fetch(new Request('https://registry/listUploads',{method:'POST',body:JSON.stringify({principal:a.principal})}));assert.equal(r.status,200);assert.equal((await r.json()).result.length,2);}
pass('listUploads: own ledger + static history only, date/size/status only, unknown principal refused, reachable via DO fetch');
// Rendered page for A.
const before=new Map(s.m);
{const r=await get('/browser/app',ctx(a.principal,a.email));assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.equal(r.headers.get('cache-control'),'private, no-store');const html=await r.text();
 assert(html.includes('a@fixture.invalid'));assert(html.includes(a.reckon_id));assert(html.includes('2.0 KB'));assert(html.includes('5.0 MB'));assert(html.includes('Received.'));assert(html.includes('1 October 2026'));assert(!html.includes('777 B')&&!html.includes('999 B')&&!html.includes('b@fixture.invalid')&&!html.includes(b.reckon_id));
 assert(!html.includes('a'.repeat(64)));assert(html.includes('href="/cdn-cgi/access/logout"'));assert(html.includes('findings are written by hand'));assert(!/<script/.test(html));assert(!/[–—]/.test(html));}
assert.equal(budget,0);assert(![...s.m.keys()].some(k=>k.startsWith('requests:')));assert.deepEqual([...s.m.keys()].sort(),[...before.keys()].sort());pass('/browser/app shows own email, Reckon ID and uploads only; empty findings state; no request budget consumed; no storage writes');
// Findings render escaped; unsafe URLs are not linked.
findingsByParticipant[a.participant]=[{title:'You <b>reviewed</b> diffs',url:'https://findings.example/one',date:'2026-11-01'},{title:'Second',url:'javascript:alert(1)',date:'2026-11-02'}];
{const html=await(await get('/browser/app',ctx(a.principal,a.email))).text();assert(html.includes('You &lt;b&gt;reviewed&lt;/b&gt; diffs'));assert(html.includes('href="https://findings.example/one"'));assert(html.includes('1 November 2026'));assert(!html.includes('javascript:'));assert(html.includes('Second'));assert(!html.includes('written by hand'));}
{const html=await(await get('/browser/app',ctx(b.principal,b.email))).text();assert(html.includes('written by hand'));assert(!html.includes('reviewed'));assert(html.includes('Started, not finished yet.'));}
const noDash=html=>{for(const re of [/<table/i,/<progress/i,/<meter/i,/<canvas/i,/<svg/i,/<script/i,/streak/i,/class="(card|tile|stat|metric)/i])assert(!re.test(html),'dashboard element '+re);};noDash(LANDING_PAGE);assert.equal(LANDING_PAGE.match(/score/gi).length,1);assert(LANDING_PAGE.includes('No scores'));noDash(renderAppPage({email:'x@fixture.invalid',reckonId:'rk_x',uploads:[{date:'2026-11-01',size:10,status:'accepted'}],findings:[{title:'t',url:'https://findings.example/',date:'2026-11-01'}]}));assert(!/score/i.test(renderAppPage({email:'x@fixture.invalid',reckonId:'rk_x'})));
assert(renderAppPage({email:'<x>',reckonId:'"y"'}).includes('&lt;x&gt;'));pass('findings: per-participant, escaped, unsafe links dropped, other participant sees empty state; neither page has tables, meters, charts, scripts, scores or stat tiles');
// Trust section: identical facts on both pages, no extra privacy claims.
{const app=renderAppPage({email:'x@fixture.invalid',reckonId:'rk_x'});
 for(const html of [LANDING_PAGE,app]){assert(!/never leaves|stays on your (machine|computer)|all secrets|fully (masked|removed)|anonymi[sz]ed\b|\bdays\b|retention period|within \d/i.test(html));assert(html.includes('What happens to your sessions'));assert(html.includes(SESSIONS_FACTS_HTML));
  const t=html.toLowerCase();for(const w of [...banned,'privacy-first','safe with us','gdpr','hipaa','soc 2','compliant','encrypted','secure','guarantee'])assert(!t.includes(w),'claim '+w);assert(!/[\u2013\u2014]/.test(html));}
 for(const fact of ['The collector runs on your machine and does not modify your original files. It uploads a copy of the transcript content with detected key-like values replaced by stars. Masking can miss secrets, and names, emails, personal information and code remain readable in the uploaded copy.','with no network calls','operated by the person running the pilot','A real person reads it to write your findings.','It is not sold, shared, or made public.','one upload per account','href="https://github.com/Archdiner/reckon-intake"','Self-serve deletion and automatic retention limits are not built into this pilot yet. It is run by one operator, the person who gave you the install command, and you can reach them directly.'])assert(SESSIONS_FACTS_HTML.includes(fact),fact);}
pass('trust section: same facts on landing and signed-in page, repo linked, no extra privacy claims');
assert.equal(budget,0);
console.log(n,'web page checks PASS');
