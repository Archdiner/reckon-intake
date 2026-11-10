import worker from'./worker.js';import{ReckonRegistry}from'./identity-registry.js';import assert from'node:assert/strict';
class Storage{constructor(){this.m=new Map();this.queue=Promise.resolve();}async get(k){return structuredClone(this.m.get(k));}async put(k,v){this.m.set(k,structuredClone(v));}async transaction(fn){const r=this.queue.then(()=>fn(this));this.queue=r.catch(()=>{});return r;}}
const store=new Storage(),reg=new ReckonRegistry({storage:store},{});const env={RECKON_REGISTRY:{idFromName:n=>n,get:()=>({fetch:(u,opts)=>reg.fetch(new Request(u,opts))})}};
const context=(principal,email)=>({access:{getIdentity:async()=>({user_uuid:principal,email})}});
const req=()=>new Request('https://test/browser/identity',{headers:{'cf-access-authenticated-user-email':'spoof@fixture.invalid'}});
assert.equal((await worker.fetch(req(),env,{})).status,401);assert.equal(store.m.size,0);
const owner=await(await worker.fetch(req(),env,context('00000000-0000-5000-8000-000000000001','owner@example.com'))).json();assert.equal(owner.reckon_id,'rk_00000000000000000000000000000001');
const first=await(await worker.fetch(req(),env,context('verified-first','first@fixture.invalid'))).json();const second=await(await worker.fetch(req(),env,context('verified-second','second@fixture.invalid'))).json();assert.notEqual(first.reckon_id,second.reckon_id);assert.equal(first.email,'first@fixture.invalid');
assert.equal((await worker.fetch(req(),env,context('changed-first','first@fixture.invalid'))).status,403);
assert.equal((await worker.fetch(req(),{...env,REVOKED_PRINCIPALS:'["verified-first"]'},context('verified-first','first@fixture.invalid'))).status,403);
const denied=await worker.fetch(new Request('https://test/browser/v2/begin',{method:'POST',body:'{}'}),env,{});assert.equal(denied.status,401);
assert.equal((await worker.fetch(new Request('https://test/browser/v1/part',{method:'POST',body:'x'}),env,context('verified-first','first@fixture.invalid'))).status,404);
console.log('PASS receivercontext: noctxfailclosed/noDOsideeffect,ownerIDpreserved,2isolatedverifiedusers,spoofheaderignored,relinkdeny,revokeddeny,unauthPOSTdenied');
