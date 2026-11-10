import {build}from'esbuild';import{Miniflare}from'miniflare';import assert from'node:assert/strict';
await build({stdin:{contents:`export {ReckonRegistry}from'./identity-registry.js';export default {async fetch(r,env){return env.REG.get(env.REG.idFromName('test')).fetch(r);}}`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',outfile:'./reckon-registry-platform-test-dist.js'});
const mf=new Miniflare({modules:true,scriptPath:'./reckon-registry-platform-test-dist.js',compatibilityDate:'2026-08-06',durableObjects:{REG:{className:'ReckonRegistry',useSQLite:true}}});
try{
 const post=async(action,value)=>{const r=await mf.dispatchFetch('https://test/'+action,{method:'POST',body:JSON.stringify(value)});return{status:r.status,...await r.json()};};
 const values=await Promise.all(Array.from({length:10},()=>post('identify',{principal:'platform-verified-1',email:'one@fixture.invalid'})));assert(values.every(x=>x.status===200));assert.equal(new Set(values.map(x=>x.result.reckon_id)).size,1);
 const second=await post('identify',{principal:'platform-verified-2',email:'two@fixture.invalid'});assert.notEqual(second.result.reckon_id,values[0].result.reckon_id);
 const bad=await post('identify',{principal:'platform-changed',email:'one@fixture.invalid'});assert.equal(bad.status,403);
 const reserve=await post('reserveBatch',{principal:'platform-verified-1',digest:'a'.repeat(64),size:1024});assert.equal(reserve.status,200);
 const cross=await post('checkBatch',{principal:'platform-verified-2',digest:'a'.repeat(64),index:0,bytes:1024});assert.equal(cross.status,409);
 const lease=await post('acquire',{kind:'finalize'});assert.equal(lease.status,200);assert.equal((await post('acquire',{kind:'finalize'})).status,429);assert.equal((await post('release',lease.result)).status,200);assert.equal((await post('acquire',{kind:'finalize'})).status,200);
 console.log('PASS realMiniflareSQLiteDO: concurrentatomicbinding,separatenamespaces,relinkdeny,crossaccountbatchdeny,globaladmissionrelease');
}finally{await mf.dispose();}
