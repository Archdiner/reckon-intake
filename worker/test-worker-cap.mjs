import worker from'./worker.js';import{ReckonRegistry,OWNER}from'./identity-registry.js';import{createHash}from'node:crypto';import assert from'node:assert/strict';
// Public fixtures: no accepted history and no extra allowances are committed
// (both are deployment-private), so every participant gets exactly one accepted
// upload. All identities and digests below are synthetic.
class Storage{constructor(){this.m=new Map();this.queue=Promise.resolve();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async transaction(fn){const r=this.queue.then(()=>fn(this));this.queue=r.catch(()=>{});return r;}}
const s=new Storage(),reg=new ReckonRegistry({storage:s},{}),token='fixture-owner-token-only',sha=x=>createHash('sha256').update(x).digest('hex');const env={HF_TOKEN:'fixture',INTAKE_TOKENS:JSON.stringify({[sha(token)]:OWNER.participant}),RECKON_REGISTRY:{idFromName:n=>n,get:()=>({fetch:(u,o)=>reg.fetch(new Request(u,o))})}};
const OWNERP=OWNER.principal;
const ctx=(p=OWNERP,email=OWNER.email)=>({access:{getIdentity:async()=>({user_uuid:p,email})}});const mA={version:1,sha256:'f'.repeat(64),size:10,chunks:[{sha256:'e'.repeat(64),size:10}]};const mB={...mA,sha256:'a'.repeat(64)};let network=0;globalThis.fetch=async()=>{network++;throw Error('No storage I/O permitted by refusal test')};
const post=async(path,body=JSON.stringify(mA),bearer=false,context=ctx())=>worker.fetch(new Request('https://test'+path,{method:'POST',body,headers:bearer?{authorization:'Bearer '+token}:{}}),env,context);
// First upload: begin is reserved on both the browser and legacy-token paths.
for(const path of ['/browser/v2/begin','/v2/begin']){const r=await post(path,JSON.stringify(mA),path==='/v2/begin');assert.equal(r.status,200);assert.equal((await r.json()).status,'reserved');}assert.equal(network,0);console.log('PASS first begin reserved on browser+legacy paths; zero provider I/O');
{const r=await post('/browser/v2/begin',JSON.stringify(mB));assert.equal(r.status,409);assert.match((await r.json()).error,/already reserved/);console.log('PASS second parallel archive blocked before acceptance');}
await reg.markAccepted({principal:OWNERP,digest:mA.sha256});
{const r=await post('/browser/v2/begin',JSON.stringify(mB));assert.equal(r.status,403);assert.match((await r.json()).error,/One successful/);console.log('PASS allowance exhausted after the first acceptance');}
{const r=await post('/browser/v2/begin',JSON.stringify(mA));assert.equal(r.status,200);const j=await r.json();assert.equal(j.status,'reserved');assert.equal(j.sha256,mA.sha256);console.log('PASS same-archive resume stays idempotent after allowance exhausted');}
// Every other participant is held to the same one-upload cap.
const OTHER='rk_11111111111111111111111111111111';await s.put('principal:other-person',{principal:'other-person',email:'other@fixture.invalid',reckon_id:OTHER,participant:OTHER,created_at:'x'});
await reg.reserveBatch({principal:'other-person',digest:'d'.repeat(64),size:10});await reg.beginCommit({principal:'other-person',digest:'d'.repeat(64)});await reg.markAccepted({principal:'other-person',digest:'d'.repeat(64)});
{const r=await post('/browser/v2/begin',JSON.stringify(mB),false,ctx('other-person','other@fixture.invalid'));assert.equal(r.status,403);assert.match((await r.json()).error,/One successful/);console.log('PASS other participant with an accepted upload still capped at one');}
{const r=await post('/browser/v2/begin',JSON.stringify(mB),false,ctx('new-person','new@fixture.invalid'));assert.equal(r.status,200);assert.equal(network,0);console.log('PASS new identity first begin still allowed');}
assert.equal((await post('/browser/v2/begin',JSON.stringify({...mA,sha256:'b'.repeat(64)}),false,ctx('new-person','new@fixture.invalid'))).status,409);console.log('PASS second parallel archive blocked before network');
// Stale accepted residue (accepted ledger entry + fulfilled claim) must not corrupt state:
// a new archive is refused cleanly and the accepted archive stays resumable.
{const s2=new Storage(),reg2=new ReckonRegistry({storage:s2},{});const known={digest:'7'.repeat(64),size:10};
 await s2.put('principal:'+OWNERP,{principal:OWNERP,email:OWNER.email,reckon_id:OWNER.reckon_id,participant:OWNER.participant,created_at:'x'});
 await s2.put('reservation-ledger',[{principal:OWNERP,participant:OWNER.participant,digest:known.digest,size:known.size,day:'2026-11-08',created_at:'x',expires:Date.now()+1e6,accepted:true}]);
 await s2.put('batch:'+OWNERP+':'+known.digest,{principal:OWNERP,participant:OWNER.participant,digest:known.digest,size:known.size,accepted:true,expires:Date.now()+1e6});
 await s2.put('upload-claim:'+OWNERP,known.digest);
 await assert.rejects(reg2.reserveBatch({principal:OWNERP,digest:'c'.repeat(64),size:10}),/One successful/);console.log('PASS accepted residue refuses a new archive cleanly, not a stuck 409');
 assert.equal((await reg2.reserveBatch({principal:OWNERP,digest:known.digest,size:known.size})).accepted,true);console.log('PASS fulfilled claim + accepted residue keep the accepted archive resumable');
 const THIRD='rk_22222222222222222222222222222222';
 await s2.put('principal:third-person',{principal:'third-person',email:'third@fixture.invalid',reckon_id:THIRD,participant:THIRD,created_at:'x'});
 await s2.put('upload-claim:third-person','d'.repeat(64));
 await s2.put('batch:third-person:'+'d'.repeat(64),{principal:'third-person',participant:THIRD,digest:'d'.repeat(64),size:10,accepted:false,expires:Date.now()+1e6});
 let blocked=false;try{await reg2.reserveBatch({principal:'third-person',digest:'e'.repeat(64),size:10});}catch(e){blocked=/final acceptance processing/.test(e.message);}assert.ok(blocked);console.log('PASS live unfulfilled claim still blocks a different archive');}
for(const path of ['/v1/part','/v1/finalize'])assert.equal((await post(path,'x',true)).status,403);console.log('PASS legacy v1 writes denied');
// Existing accepted archive: provider receipt readback with zero provider mutations.
const D8='8'.repeat(64),chunk={sha256:'1'.repeat(64),size:30};const manifest={version:1,sha256:D8,size:30,chunks:[chunk]};
await s.put('reservation-ledger',[...((await s.get('reservation-ledger'))||[]),{principal:OWNERP,participant:OWNER.participant,digest:D8,size:30,day:'2026-11-09',created_at:'x',expires:Date.now()+1e6,accepted:true}]);
await s.put('batch:'+OWNERP+':'+D8,{principal:OWNERP,participant:OWNER.participant,digest:D8,size:30,accepted:true,expires:Date.now()+1e6});
import{ticket}from'./staging.js';for(let i=0;i<manifest.chunks.length;i++){const c=manifest.chunks[i];c.stage_ticket=ticket(env,sha('reckon-access-v1:'+OWNERP),OWNER.participant,D8,i,c.sha256,c.size);}
let writes=0;globalThis.fetch=async(url,opts={})=>{const u=String(url);if(u.includes('/paths-info/')){const paths=JSON.parse(opts.body).paths;return Response.json(paths.map((path,i)=>({path,type:'file',size:manifest.chunks[i].size,lfs:{oid:manifest.chunks[i].sha256}})));}if(opts.method==='POST'){writes++;throw Error('No provider write expected')}if(u.endsWith('/verified.json'))return Response.json({...manifest,participant:OWNER.participant,parts_revision:'self',validation:{validator_version:1,sessions:1}});return Response.json({private:true,sha:'fixture-revision'});};
const reused=await post('/browser/v2/finalize',JSON.stringify(manifest));assert.equal(reused.status,200);assert.equal((await reused.json()).reused_acceptance,true);assert.equal(writes,0);console.log('PASS accepted same-archive receipt retrieved with zero provider mutations');
