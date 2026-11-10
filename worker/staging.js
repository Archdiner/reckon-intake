// Private HF large-file staging. Incoming parts stay bounded to 3 MiB.
// No per-part Git commit. Finalize atomically commits all verified part references and one receipt.
import {createHmac,timingSafeEqual} from 'node:crypto';
const REPO='carneasado/coding-session-intake';
const api=`https://huggingface.co/datasets/${REPO}.git/info/lfs/objects/batch`;
const problem=(message,status=503)=>Object.assign(Error(message),{status});
function safeAction(action){
 if(!action||typeof action.href!=='string')throw problem('Private storage action unavailable');
 const u=new URL(action.href);
 if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='huggingface.co'||u.hostname.endsWith('.hf.co')||u.hostname.endsWith('.huggingface.co')||u.hostname.endsWith('.amazonaws.com')))throw problem('Private storage action refused');
 return u;
}
function actionHeaders(env,action,url){
 const headers=new Headers(action.header||{});
 if(url.hostname!=='huggingface.co'&&(url.href.includes(env.HF_TOKEN)||[...headers.values()].some(value=>value.includes(env.HF_TOKEN))))throw problem('Private storage credential forwarding refused');
 return headers;
}
async function batch(env,operation,hash,size){
 const r=await fetch(api,{method:'POST',headers:{Authorization:`Bearer ${env.HF_TOKEN}`,'content-type':'application/vnd.git-lfs+json'},body:JSON.stringify({operation,transfers:['basic'],objects:[{oid:hash,size}]})});
 if(!r.ok)throw problem('Private storage staging unavailable',r.status===429?429:503);
 const j=await r.json();const obj=j.objects?.[0];
 if(operation==='download'&&obj?.error?.code===404)throw Object.assign(problem('Staged object expired or is missing; re-stage the same archive',409),{code:'restage-required'});
 if(!Array.isArray(j.objects)||j.objects.length!==1||!obj||obj.oid!==hash||obj.size!==size||obj.error)throw problem('Private storage object not confirmed');
 return obj;
}
export async function stage(env,hash,body){
 const obj=await batch(env,'upload',hash,body.length);
 if(obj.actions?.upload){
  const a=obj.actions.upload,u=safeAction(a);
  // Only provider-issued action headers go to object storage, never the HF bearer.
  const r=await fetch(u,{method:'PUT',headers:actionHeaders(env,a,u),body,redirect:'manual'});
  await r.body?.cancel();if(!r.ok)throw problem('Private storage object upload failed');
  if(obj.actions?.verify){
   const v=obj.actions.verify,url=safeAction(v);
   const response=await fetch(url,{method:'POST',headers:(()=>{const headers=actionHeaders(env,v,url);headers.set('content-type','application/json');return headers;})(),body:JSON.stringify({oid:hash,size:body.length}),redirect:'manual'});
   await response.body?.cancel();if(!response.ok)throw problem('Private storage object verification failed');
  }
 }
 return await downloadStaged(env,hash,body.length);
}
export async function downloadStaged(env,hash,size){
 const obj=await batch(env,'download',hash,size);const a=obj.actions?.download,u=safeAction(a);
 const r=await fetch(u,{headers:actionHeaders(env,a,u),redirect:'manual'});
 if(!r.ok)throw problem('Private storage staged readback failed');
 return r;
}
export function ticket(env,tokenHash,participant,digest,index,hash,size){
 return createHmac('sha256',env.HF_TOKEN).update(JSON.stringify(['private-intake-stage-v2',tokenHash,participant,digest,index,hash,size])).digest('hex');
}
export function validTicket(expected,observed){
 return typeof observed==='string'&&/^[a-f0-9]{64}$/.test(observed)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(observed,'hex'));
}
export async function commitAccepted(env,paths,receiptPath,receiptBytes){
 const lines=[{key:'header',value:{summary:'Accept fully validated private intake archive'}}];
 for(const p of paths)lines.push({key:'lfsFile',value:{path:p.path,algo:'sha256',size:p.size,oid:p.sha256}});
 lines.push({key:'file',value:{path:receiptPath,content:Buffer.from(receiptBytes).toString('base64'),encoding:'base64'}});
 const r=await fetch(`https://huggingface.co/api/datasets/${REPO}/commit/main`,{method:'POST',headers:{Authorization:`Bearer ${env.HF_TOKEN}`,'content-type':'application/x-ndjson'},body:lines.map(x=>JSON.stringify(x)).join('\n')});
 if(!r.ok){
  const wait=r.headers.get('retry-after');await r.body?.cancel();
  if(r.status===429)throw Object.assign(problem('Private storage commit quota reached; retain the same archive and retry after the stated wait',429),{retryAfter:/^\d+$/.test(wait||'')?Number(wait):3600});
  throw problem('Private storage atomic acceptance commit failed');
 }
 const j=await r.json();if(!/^[a-f0-9]{40}$/.test(j.commitOid||''))throw problem('Private storage acceptance revision missing');return j.commitOid;
}
export async function verifyCommittedPaths(env,paths,revision){
 const r=await fetch(`https://huggingface.co/api/datasets/${REPO}/paths-info/${revision}`,{method:'POST',headers:{Authorization:`Bearer ${env.HF_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({paths:paths.map(x=>x.path),expand:false})});
 if(!r.ok)throw problem('Private storage committed references unavailable');
 const j=await r.json();if(!Array.isArray(j)||j.length!==paths.length)throw problem('Private storage committed references incomplete');
 const byPath=new Map(j.map(x=>[x.path,x]));
 for(const p of paths){const f=byPath.get(p.path);if(!f||f.type!=='file'||f.size!==p.size||f.lfs?.oid!==p.sha256)throw problem('Private storage committed reference mismatch');}
}
