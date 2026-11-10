import {acceptedHistory} from './accepted-history.js';
// Atomic, private identity binding and admission. Called only by the receiver.
//
// PUBLIC REPOSITORY NOTE: the live deployment's real owner identity, approved
// extra-upload allowances, and accepted-upload history are deployment-private
// and are not committed here. A deployment injects its own OWNER values,
// EXTRA_UPLOADS and accepted-history.js from outside git. The placeholders
// below keep this code runnable and the tests self-contained.
export const OWNER={principal:'00000000-0000-5000-8000-000000000001',email:'owner@example.com',reckon_id:'rk_00000000000000000000000000000001',participant:'owner'};
const fail=(message,status=403)=>Object.assign(new Error(message),{status});
// Per-participant accepted-upload allowance: the static accepted record plus any
// approved extras. With the public empty history and no extras, every
// participant gets exactly one accepted upload.
const EXTRA_UPLOADS={};
function acceptedCount(participant,principal,ledger){
 const known=new Set(acceptedHistory.filter(x=>x.participant===participant).map(x=>x.digest));
 for(const x of ledger||[])if(x.principal===principal&&x.accepted)known.add(x.digest);
 return known.size;
}
function allowance(participant){return acceptedHistory.filter(x=>x.participant===participant).length+(EXTRA_UPLOADS[participant]||0)||1;}
async function claimActive(tx,principal,claim){
 if(!claim)return false;
 const row=await tx.get('batch:'+principal+':'+claim);
 return !(row&&row.accepted);
}
export class ReckonRegistry {
 constructor(state,env){this.state=state;this.env=env;}
 async identify(identity){
  const {principal,email}=identity||{};
  if(typeof principal!=='string'||!principal||principal.length>128||typeof email!=='string'||email.length>320||!email.includes('@'))throw fail('Verified identity missing');
  return this.state.storage.transaction(async tx=>{
   const key='principal:'+principal;let row=await tx.get(key);
   if(row){if(row.revoked)throw fail('This Reckon account is paused');if(row.email!==email)throw fail('Identity changed; explicit re-linking required');return row;}
   if(principal===OWNER.principal){if(email!==OWNER.email)throw fail('Owner identity changed; explicit re-linking required');row={...OWNER,created_at:new Date().toISOString()};await tx.put(key,row);return row;}
   // Email is descriptive, never a merge key. A changed principal cannot claim an old identity.
   if(email===OWNER.email)throw fail('Owner identity changed; explicit re-linking required');
   const old=await tx.get('email:'+email);if(old&&old!==principal)throw fail('Identity changed; explicit re-linking required');
   const count=(await tx.get('new-user-count'))||0;
   if(count>=49)throw fail('Reckon signup capacity reached',429);
   const id='rk_'+crypto.randomUUID().replaceAll('-','');row={principal,email,reckon_id:id,participant:id,created_at:new Date().toISOString()};
   await tx.put(key,row);await tx.put('email:'+email,principal);await tx.put('new-user-count',count+1);return row;
  });
 }
 async reserveBatch({principal,digest,size,now=Date.now()}){
  if(typeof digest!=='string'||! /^[a-f0-9]{64}$/.test(digest)||!Number.isInteger(size)||size<1||size>512*1024**2)throw fail('Invalid batch reservation',400);
  return this.state.storage.transaction(async tx=>{
   const row=await tx.get('principal:'+principal);if(!row||row.revoked)throw fail('Account not active');
   const day=new Date(now).toISOString().slice(0,10),key='batch:'+principal+':'+digest;
   let ledger=(await tx.get('reservation-ledger'))||[];
   ledger=ledger.filter(x=>x.accepted||x.committing||x.expires>now);
   const known=acceptedHistory.filter(x=>x.participant===row.participant);
   const accepted=ledger.filter(x=>x.principal===principal&&x.accepted);
   const already=known.find(x=>x.digest===digest)||accepted.find(x=>x.digest===digest);
   if(already){if(already.size!==size)throw fail('Reserved archive size mismatch',400);return {...already,principal,participant:row.participant,accepted:true};}
   if(acceptedCount(row.participant,principal,ledger)>=allowance(row.participant))throw fail('One successful upload per account; your previous upload is already received. Local archive kept',403);
   const claim=await tx.get('upload-claim:'+principal);if(claim&&claim!==digest&&await claimActive(tx,principal,claim))throw fail('An archive has already reached final acceptance processing; resume that same archive',409);
   const previous=ledger.find(x=>x.principal===principal&&x.digest===digest);
   if(previous){if(previous.size!==size)throw fail('Reserved archive size mismatch',400);return previous;}
   if(ledger.some(x=>x.principal===principal&&!x.accepted))throw fail('An upload is already reserved for this account; resume that same archive, or retry after its reservation expires',409);
   const open=ledger.filter(x=>!x.accepted),person=open.filter(x=>x.principal===principal),daily=open.filter(x=>x.day===day),personDaily=person.filter(x=>x.day===day);
   const bytes=rows=>rows.reduce((n,x)=>n+x.size,0);
   if(bytes(open)+size>10*1024**3||open.length>=100||bytes(person)+size>1024**3||person.length>=10)throw fail('Pilot storage limit reached; local archive kept',429);
   if(bytes(daily)+size>2*1024**3||daily.length>=20||bytes(personDaily)+size>512*1024**2||personDaily.length>=3)throw fail('Pilot daily upload limit reached; local archive kept',429);
   const batch={principal,participant:row.participant,digest,size,day,created_at:new Date(now).toISOString(),expires:now+24*60*60*1000,accepted:false};
   ledger.push(batch);await tx.put('reservation-ledger',ledger);await tx.put(key,batch);return batch;
  });
 }
 async checkBatch({principal,digest,index,bytes}){
  const row=await this.state.storage.get('principal:'+principal);if(!row||row.revoked)throw fail('Account not active');
  const batch=acceptedHistory.find(x=>x.participant===row.participant&&x.digest===digest)||await this.state.storage.get('batch:'+principal+':'+digest);if(!batch||(!batch.accepted&&batch.expires!==undefined&&batch.expires<=Date.now()))throw fail('Upload reservation required',409);
  const ledger=(await this.state.storage.get('reservation-ledger'))||[];if(!batch.accepted&&batch.expires!==undefined&&acceptedCount(row.participant,principal,ledger)>=allowance(row.participant))throw fail('One successful upload per account; previous archive already received',403);
  const chunk=3*1024**2,max=Math.ceil(batch.size/chunk);if(!Number.isInteger(index)||index<0||index>=max||bytes!==(index===max-1?batch.size-index*chunk:chunk))throw fail('Reserved part mismatch',400);return batch;
 }
 async acquire({kind,now=Date.now()}){
  if(!['part','finalize'].includes(kind))throw fail('Invalid admission kind',400);
  return this.state.storage.transaction(async tx=>{
   const rows=(await tx.get('leases'))||[];const live=rows.filter(x=>x.expires>now);const limit=kind==='finalize'?1:4;
   if(live.filter(x=>x.kind===kind).length>=limit)throw fail('Reckon is busy; retry the same archive',429);
   const id=crypto.randomUUID();live.push({id,kind,expires:now+120000});await tx.put('leases',live);return id;
  });
 }
 async requestBudget({principal,now=Date.now()}){
  return this.state.storage.transaction(async tx=>{
   const row=await tx.get('principal:'+principal);if(!row||row.revoked)throw fail('Account not active');
   const day=new Date(now).toISOString().slice(0,10),key='requests:'+day,pk=key+':'+principal;
   const global=(await tx.get(key))||0,person=(await tx.get(pk))||0;
   if(global>=10000||person>=1000)throw fail('Daily request limit reached; local archive kept',429);
   await tx.put(key,global+1);await tx.put(pk,person+1);
  });
 }
 async fetch(request){
  try{
   if(request.method!=='POST')throw fail('Not found',404);
   const action=new URL(request.url).pathname.slice(1);const allowed=['identify','reserveBatch','checkBatch','acquire','release','markAccepted','requestBudget','renew','beginCommit','staleCommits','releaseFailedCommit'];
   if(!allowed.includes(action))throw fail('Not found',404);
   const text=await request.text();if(text.length>16384)throw fail('Request too large',413);
   const value=JSON.parse(text),result=await this[action](value);return Response.json({result:result??null});
  }catch(e){return Response.json({error:e.status?e.message:'Registry unavailable'},{status:e.status||503});}
 }
 async release(id){return this.state.storage.transaction(async tx=>{const rows=(await tx.get('leases'))||[];await tx.put('leases',rows.filter(x=>x.id!==id));});}
 async renew(id){return this.state.storage.transaction(async tx=>{const rows=(await tx.get('leases'))||[];const row=rows.find(x=>x.id===id&&x.expires>Date.now());if(!row)throw fail('Admission expired; retry same archive',409);row.expires=Date.now()+120000;await tx.put('leases',rows);});}
 async staleCommits({}){const ledger=(await this.state.storage.get('reservation-ledger'))||[];return ledger.filter(x=>x.committing&&!x.accepted&&x.expires<=Date.now());}
 async releaseFailedCommit({principal,digest}){return this.state.storage.transaction(async tx=>{
  const now=Date.now(),leases=(await tx.get('leases'))||[];if(leases.some(x=>x.kind==='finalize'&&x.expires>now))throw fail('Finalization still active',409);
  const ledger=(await tx.get('reservation-ledger'))||[],row=ledger.find(x=>x.principal===principal&&x.digest===digest);
  if(!row||row.accepted||!row.committing||row.expires>now)throw fail('Reconciliation not eligible',409);
  await tx.put('reservation-ledger',ledger.filter(x=>x!==row));await tx.put('batch:'+principal+':'+digest,{...row,committing:false,expires:0});
 });}
 async beginCommit({principal,digest}){return this.state.storage.transaction(async tx=>{
  const key='batch:'+principal+':'+digest;const row=await tx.get(key),ledger=(await tx.get('reservation-ledger'))||[];
  const entry=ledger.find(x=>x.principal===principal&&x.digest===digest);
  if(acceptedCount(row?.participant,principal,ledger)>=allowance(row?.participant))throw fail('One successful upload per account; previous archive already received',403);
  if(!row||!entry||(!entry.accepted&&!entry.committing&&entry.expires<=Date.now()))throw fail('Reservation expired; retry same archive',409);
  const claim=await tx.get('upload-claim:'+principal);if((claim&&claim!==digest&&await claimActive(tx,principal,claim))||ledger.some(x=>x.principal===principal&&x.committing&&x.digest!==digest))throw fail('Another archive has reached final acceptance processing; resume that same archive',409);
  await tx.put('upload-claim:'+principal,digest);
  entry.committing=true;await tx.put('reservation-ledger',ledger);await tx.put(key,{...row,committing:true});
 });}
 async markAccepted({principal,digest}){return this.state.storage.transaction(async tx=>{
  const identity=await tx.get('principal:'+principal);if(acceptedHistory.some(x=>x.participant===identity?.participant&&x.digest===digest))return;
  const key='batch:'+principal+':'+digest;const row=await tx.get(key);if(!row)throw fail('Batch missing',409);
  const ledger=(await tx.get('reservation-ledger'))||[];const entry=ledger.find(x=>x.principal===principal&&x.digest===digest);if(!entry)throw fail('Reservation expired; retry same archive',409);
  entry.accepted=true;entry.committing=false;await tx.put('reservation-ledger',ledger);await tx.put(key,{...row,accepted:true,committing:false});
 });}
}
