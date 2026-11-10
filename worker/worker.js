import {ReckonRegistry,OWNER} from './identity-registry.js';
export {ReckonRegistry};
import {stage,downloadStaged,ticket,validTicket,commitAccepted,verifyCommittedPaths} from './staging.js';
import {installer,clientBase64} from './client-assets.js';
import {uploadFiles} from '@huggingface/hub';
import {createHash} from 'node:crypto';
import {validateTarGz} from './validate.js';
const REPO='carneasado/coding-session-intake',CHUNK=3*1024**2,MAX=512*1024**2;
const sha=b=>createHash('sha256').update(b).digest('hex');
const hex=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const fail=(s,status=400)=>Object.assign(Error(s),{status});
function check(m){if(!m||m.version!==1||!hex(m.sha256)||!Number.isInteger(m.size)||m.size<1||m.size>MAX||!Array.isArray(m.chunks)||m.chunks.length!==Math.ceil(m.size/CHUNK))throw fail('Invalid manifest');for(let i=0;i<m.chunks.length;i++){const c=m.chunks[i],size=i===m.chunks.length-1?m.size-CHUNK*i:CHUNK;if(!c||!hex(c.sha256)||c.size!==size)throw fail('Invalid chunk manifest');}return m;}
const root=(p,d)=>`intake-v1/${p}/${d}`;
const partPath=(p,d,i,h)=>`${root(p,d)}/parts/${String(i).padStart(2,'0')}-${h}.bin`;
async function info(env){const r=await fetch(`https://huggingface.co/api/datasets/${REPO}`,{headers:{Authorization:`Bearer ${env.HF_TOKEN}`}});if(!r.ok)throw fail('Storage unavailable',503);const j=await r.json();if(j.private!==true||!j.sha)throw fail('Private destination not verified',503);return j;}
async function put(env,path,body,title){let r;try{r=await uploadFiles({repo:{type:'dataset',name:REPO},accessToken:env.HF_TOKEN,files:[{path,content:new Blob([body])}],commitTitle:title,useWebWorkers:false,useXet:false});}catch(e){if(e.statusCode===429)throw Object.assign(fail('Private storage commit quota reached; keep the same archive and retry after the stated wait',429),{retryAfter:3600});throw fail('Storage upload unavailable; retry the same archive',503);}if(!r.commit?.oid)throw fail('No storage revision',503);return r.commit.oid;}
async function get(env,path,rev){let url=new URL(`https://huggingface.co/datasets/${REPO}/resolve/${rev}/${path}`);for(let i=0;i<6;i++){let r;try{r=await fetch(url,{headers:url.hostname==='huggingface.co'?{Authorization:`Bearer ${env.HF_TOKEN}`}:{},redirect:'manual'});}catch(e){throw fail('Storage download unavailable',503);}if([301,302,303,307,308].includes(r.status)){const target=r.headers.get('location');await r.body?.cancel();if(!target)throw fail('Storage redirect missing',503);url=new URL(target,url);if(url.protocol!=='https:'||url.username||url.password)throw fail('Unsafe storage redirect',503);continue;}if(!r.ok)throw fail('Stored part unavailable',r.status===404?422:503);return r;}throw fail('Storage redirect limit',503);}
async function bounded(request,max){const reader=request.body?.getReader();if(!reader)throw fail('Body missing');const chunks=[];let size=0;try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max)throw fail('Body limit',413);chunks.push(r.value);}const b=new Uint8Array(size);let pos=0;for(const c of chunks){b.set(c,pos);pos+=c.length;}return b;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
async function registry(env,action,value){
 if(!env.RECKON_REGISTRY)throw fail('Registration temporarily unavailable',503);
 const object=env.RECKON_REGISTRY.get(env.RECKON_REGISTRY.idFromName('reckon-identity-v1'));
 const response=await object.fetch('https://registry/'+action,{method:'POST',body:JSON.stringify(value),headers:{'content-type':'application/json'}});const result=await response.json();
 if(!response.ok)throw fail(result.error||'Registry unavailable',response.status);return result.result;
}
async function handle(request,env,ctx,admission){
 const url=new URL(request.url);
 let participant,tokenHash,principal,reckonId,browser=false;
 if(url.pathname==='/browser'||url.pathname.startsWith('/browser/')){
  if(!ctx?.access)throw fail('Browser sign-in required',401);
  const identity=await ctx.access.getIdentity();
  if(typeof identity?.email!=='string'||typeof identity?.user_uuid!=='string'||!identity.user_uuid)throw fail('Verified user identity required',403);
  if((JSON.parse(env.REVOKED_PRINCIPALS||'[]')).includes(identity.user_uuid))throw fail('This Reckon account is paused',403);
  const account=await registry(env,'identify',{email:identity.email,principal:identity.user_uuid});
  participant=account.participant;reckonId=account.reckon_id;principal=account.principal;browser=true;tokenHash=sha('reckon-access-v1:'+principal);
  if(request.method==='GET'&&url.pathname==='/browser/identity')return Response.json({email:identity.email,reckon_id:reckonId},{headers:{'cache-control':'private, no-store'}});
  if(request.method==='GET'&&url.pathname==='/browser/login')return new Response('Signed in to Reckon. Return to your terminal.',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'private, no-store'}});
  url.pathname=url.pathname.slice('/browser'.length);
  if(request.method==='POST'&&!['/v2/begin','/v2/part','/v2/finalize'].includes(url.pathname))throw fail('Browser uploads require v2',404);
 }
 if(request.method==='GET'&&['/health','/'].includes(url.pathname))return Response.json({service:'private-coding-session-intake',version:1,authenticated_upload_required:true,archive_limit_bytes:MAX,chunk_bytes:CHUNK,max_sessions:50});
 if(request.method==='GET'&&url.pathname==='/reckon-wordmark.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="160" viewBox="0 0 720 160"><title>Reckon</title><text x="360" y="118" text-anchor="middle" fill="#087f9c" font-family="Arial,Helvetica,sans-serif" font-size="112" font-weight="800" letter-spacing="8">RECKON</text></svg>',{headers:{'content-type':'image/svg+xml','cache-control':'public,max-age=3600','x-content-type-options':'nosniff'}});
 if(request.method==='GET'&&url.pathname==='/install.sh')return new Response(installer,{headers:{'content-type':'text/x-shellscript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 if(request.method!=='POST'&&!(request.method==='GET'&&url.pathname==='/v1/client.zip'))throw fail('Not found',404);
 if(!env.HF_TOKEN||!env.INTAKE_TOKENS)throw fail('Intake not configured',503);
 if(!participant){const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer ')||auth.length>256)throw fail('Unauthorized',401);
 tokenHash=sha(auth.slice(7));const grants=JSON.parse(env.INTAKE_TOKENS);participant=grants[tokenHash];if(!participant||!/^[A-Za-z0-9_-]{1,64}$/.test(participant))throw fail('Unauthorized',401);}
 if(request.method==='GET'&&url.pathname==='/v1/client.zip')return new Response(Uint8Array.from(atob(clientBase64),c=>c.charCodeAt(0)),{headers:{'content-type':'application/zip','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 if(browser&&request.method==='POST'&&!['/v2/begin','/v2/part','/v2/finalize'].includes(url.pathname))throw fail('Browser uploads require v2',404);
 if(!browser&&request.method==='POST'){
  if(participant!==OWNER.participant)throw fail('Legacy token uploads are disabled; use browser sign-in',403);
  const account=await registry(env,'identify',{principal:OWNER.principal,email:OWNER.email});
  principal=account.principal;reckonId=account.reckon_id;
  if(!['/v2/begin','/v2/part','/v2/finalize'].includes(url.pathname))throw fail('Legacy v1 writes are disabled; use the current installer',403);
 }
 if(request.method==='POST')await registry(env,'requestBudget',{principal});
 if(request.method==='POST'&&url.pathname==='/v2/begin'){
  const m=check(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(request,65536))));
  const stale=await registry(env,'staleCommits',{principal});
  if(stale.length){const revision=(await info(env)).sha;for(const entry of stale){let stored;try{stored=JSON.parse(new TextDecoder().decode(await bounded(await get(env,root(entry.participant,entry.digest)+'/verified.json',revision),65536)));}catch(e){if(e.status!==422)throw e;await registry(env,'releaseFailedCommit',{principal:entry.principal,digest:entry.digest});continue;}if(stored.sha256!==entry.digest||stored.size!==entry.size||stored.participant!==entry.participant||![1,2].includes(stored.validation?.validator_version))throw fail('Prior receipt reconciliation mismatch',503);await registry(env,'markAccepted',{principal:entry.principal,digest:entry.digest});}}
  await registry(env,'reserveBatch',{principal,digest:m.sha256,size:m.size});return Response.json({status:'reserved',sha256:m.sha256,size:m.size,reckon_id:reckonId});
 }
 if(['/v1/part','/v2/part'].includes(url.pathname)){
  const d=request.headers.get('x-archive-sha256'),h=request.headers.get('x-chunk-sha256'),indexText=request.headers.get('x-chunk-index');if(!hex(d)||!hex(h)||!/^\d{1,3}$/.test(indexText||''))throw fail('Invalid part metadata');const i=Number(indexText);if(i>=Math.ceil(MAX/CHUNK))throw fail('Part index');
  {const size=Number(request.headers.get('content-length'));if(!Number.isInteger(size))throw fail('Part length required',400);const batch=await registry(env,'checkBatch',{principal,digest:d,index:i,bytes:size});if(batch.accepted||batch.expires===undefined){const b=await bounded(request,CHUNK);if(b.length!==size||sha(b)!==h)throw fail('Chunk hash mismatch');return Response.json({status:'part-staged',index:i,sha256:h,bytes:b.length,stage_ticket:ticket(env,tokenHash,participant,d,i,h,b.length),reused_acceptance:true});}}
  const b=await bounded(request,CHUNK);if(!b.length||sha(b)!==h)throw fail('Chunk hash mismatch');await info(env);
  if(url.pathname==='/v2/part'){const back=await bounded(await stage(env,h,b),CHUNK);if(back.length!==b.length||sha(back)!==h)throw fail('Staged part readback mismatch',503);return Response.json({status:'part-staged',index:i,sha256:h,bytes:b.length,stage_ticket:ticket(env,tokenHash,participant,d,i,h,b.length)});}
  const rev=await put(env,partPath(participant,d,i,h),b,'Store private intake part');
  const readback=await bounded(await get(env,partPath(participant,d,i,h),rev),CHUNK);if(readback.byteLength!==b.length||sha(readback)!==h)throw fail('Part readback mismatch',503);
  return Response.json({status:'part-stored',index:i,sha256:h,bytes:b.length,revision:rev});
 }
 if(['/v1/finalize','/v2/finalize'].includes(url.pathname)){
  const m=check(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(request,65536))));let rev=(await info(env)).sha;const reserved=await registry(env,'reserveBatch',{principal,digest:m.sha256,size:m.size});
  if(url.pathname==='/v2/finalize'){for(let index=0;index<m.chunks.length;index++){const c=m.chunks[index];if(!validTicket(ticket(env,tokenHash,participant,m.sha256,index,c.sha256,c.size),c.stage_ticket))throw fail('Staged part authorization missing',422);}
   const storedPath=root(participant,m.sha256)+'/verified.json';let previous;try{previous=await bounded(await get(env,storedPath,rev),65536);}catch(e){if(e.status!==422)throw e;}
   if(previous){const accepted=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(previous));if(accepted.sha256!==m.sha256||accepted.size!==m.size||accepted.participant!==participant||![1,2].includes(accepted.validation?.validator_version)||!Number.isInteger(accepted.validation.sessions)||accepted.validation.sessions<1||accepted.validation.sessions>50||!Array.isArray(accepted.chunks)||accepted.chunks.length!==m.chunks.length||accepted.chunks.some((c,index)=>c.sha256!==m.chunks[index].sha256||c.size!==m.chunks[index].size))throw fail('Existing acceptance does not match this archive',503);const partRevision=accepted.parts_revision==='self'?rev:accepted.parts_revision;await verifyCommittedPaths(env,m.chunks.map((c,index)=>({path:partPath(participant,m.sha256,index,c.sha256),sha256:c.sha256,size:c.size})),partRevision);await info(env);await registry(env,'markAccepted',{principal,digest:m.sha256});return Response.json({status:'accepted',sha256:m.sha256,size:m.size,sessions:accepted.validation.sessions,repo:REPO,manifest_path:storedPath,revision:rev,parts_revision:partRevision,reused_acceptance:true});}
   if(reserved.accepted)throw fail('Previous acceptance is unavailable; no new upload allowed',503);
   await info(env);}
  let i=0,total=0;const hash=createHash('sha256');
  const stream=new ReadableStream({async pull(controller){try{if(i===m.chunks.length){if(total!==m.size||hash.digest('hex')!==m.sha256)throw fail('Archive hash mismatch',422);controller.close();return;}const c=m.chunks[i];const b=await bounded(url.pathname==='/v2/finalize'?await downloadStaged(env,c.sha256,c.size):await get(env,partPath(participant,m.sha256,i,c.sha256),rev),c.size);if(b.length!==c.size||sha(b)!==c.sha256)throw fail('Stored chunk mismatch',422);total+=b.length;hash.update(b);i++;controller.enqueue(b);}catch(e){controller.error(e);}}});
  const validated=await validateTarGz(stream);if(i!==m.chunks.length||total!==m.size)throw fail('Archive incomplete',422);await info(env);
  const receipt={...m,participant,parts_revision:url.pathname==='/v2/finalize'?'self':rev,validation:{...validated,validator_version:2},accepted_at:new Date().toISOString()};const raw=new TextEncoder().encode(JSON.stringify(receipt));const path=root(participant,m.sha256)+'/verified.json';if(admission)await registry(env,'renew',admission);await registry(env,'beginCommit',{principal,digest:m.sha256});const receiptRev=url.pathname==='/v2/finalize'?await commitAccepted(env,m.chunks.map((c,index)=>({path:partPath(participant,m.sha256,index,c.sha256),sha256:c.sha256,size:c.size})),path,raw):await put(env,path,raw,'Accept validated private coding-session archive');if(url.pathname==='/v2/finalize')await verifyCommittedPaths(env,m.chunks.map((c,index)=>({path:partPath(participant,m.sha256,index,c.sha256),sha256:c.sha256,size:c.size})),receiptRev);const remote=await bounded(await get(env,path,receiptRev),65536);if(sha(remote)!==sha(raw))throw fail('Receipt readback mismatch',503);await info(env);await registry(env,'markAccepted',{principal,digest:m.sha256});
  return Response.json({status:'accepted',sha256:m.sha256,size:m.size,sessions:validated.sessions,repo:REPO,manifest_path:path,revision:receiptRev,parts_revision:url.pathname==='/v2/finalize'?receiptRev:rev});
 }
 throw fail('Not found',404);
}
let inflight=0;
export default {async fetch(request,env,ctx){let counted=false,lease,heartbeat;try{if(request.method==='POST'&&(new URL(request.url).pathname.startsWith('/browser/v2/')||new URL(request.url).pathname.startsWith('/v2/'))){if(new URL(request.url).pathname.startsWith('/browser/')&&!ctx?.access)throw fail('Browser sign-in required',401);const kind=new URL(request.url).pathname.endsWith('/finalize')?'finalize':'part';lease=await registry(env,'acquire',{kind});heartbeat=setInterval(()=>registry(env,'renew',lease).catch(()=>{}),30000);}if(request.method==='POST'){if(inflight>=2)throw fail('Receiver busy; retry the same archive',429);inflight++;counted=true;}return await handle(request,env,ctx,lease);}catch(e){const status=e.status||((e instanceof SyntaxError)?400:422);return Response.json({status:'rejected',error:e.status?e.message:(status===400?'Invalid JSON':'Archive or storage validation failed'),...(e.code==='restage-required'?{code:e.code}:{})},{status,headers:(e.retryAfter||status===429)?{'retry-after':String(e.retryAfter||30)}:{}});}finally{if(heartbeat)clearInterval(heartbeat);if(counted)inflight--;if(lease)await registry(env,'release',lease).catch(()=>{});}}};
