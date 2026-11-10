import {createHash} from 'node:crypto';
const decoder=new TextDecoder('utf-8',{fatal:true});
const text=b=>decoder.decode(b.subarray(0,b.indexOf(0)<0?b.length:b.indexOf(0)));
const octal=b=>{const s=text(b).trim();if(!/^[0-7]*$/.test(s))throw Error('unsupported tar number');const n=parseInt(s||'0',8);if(!Number.isSafeInteger(n)||n<0)throw Error('tar number');return n;};
const safe=n=>typeof n==='string'&&n.length>0&&!n.startsWith('/')&&!n.includes('\\')&&!n.split('/').some(x=>!x||x==='.'||x==='..');
export async function validateTarGz(compressed){
 const reader=compressed.pipeThrough(new DecompressionStream('gzip')).getReader();let pending=new Uint8Array(0),eof=false,expanded=0;
 const take=async n=>{while(pending.length<n&&!eof){const r=await reader.read();if(r.done){eof=true;break;}expanded+=r.value.length;if(expanded>512*1024**2+1024*1024)throw Error('expanded archive limit');const b=new Uint8Array(pending.length+r.value.length);b.set(pending);b.set(r.value,pending.length);pending=b;}if(pending.length<n)throw Error('truncated tar');const b=pending.slice(0,n);pending=pending.subarray(n);return b;};
 const members=new Map();let total=0,manifest='',longPath=null,pax={},zeros=0;
 try{
 while(true){
  const header=await take(512);if(header.every(x=>x===0)){if(++zeros===2)break;continue;}if(zeros)throw Error('invalid tar end');
  let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:header[i];if(checksum!==octal(header.subarray(148,156)))throw Error('tar checksum');
  let name=text(header.subarray(0,100));const prefix=text(header.subarray(345,500));if(prefix)name=prefix+'/'+name;
  const type=header[156];let size=octal(header.subarray(124,136));
  if(type===120||type===76){if(size>65536)throw Error('tar metadata limit');const b=await take(size);if(size%512)await take(512-size%512);if(type===76)longPath=text(b);else{
   let pos=0;while(pos<b.length){let sp=b.indexOf(32,pos);if(sp<0)throw Error('pax header');const len=Number(decoder.decode(b.subarray(pos,sp)));if(!Number.isInteger(len)||len<3||pos+len>b.length)throw Error('pax length');const pair=decoder.decode(b.subarray(sp+1,pos+len-1));const eq=pair.indexOf('=');if(eq<1)throw Error('pax pair');pax[pair.slice(0,eq)]=pair.slice(eq+1);pos+=len;}
  }continue;}
  name=pax.path||longPath||name;if(pax.size!==undefined){if(!/^\d+$/.test(pax.size))throw Error('pax size');size=Number(pax.size);}pax={};longPath=null;
  if(type!==0&&type!==48)throw Error('nonregular member');if(!safe(name)||members.has(name))throw Error('unsafe/duplicate member');if(members.size>=250)throw Error('member count');
  total+=size;if(!Number.isSafeInteger(size)||size<0||total>512*1024**2)throw Error('expanded archive limit');if(name==='manifest.jsonl'&&size>10*1024**2)throw Error('manifest limit');
  const h=createHash('sha256');let left=size;const pieces=[];while(left){const b=await take(Math.min(left,65536));h.update(b);if(name==='manifest.jsonl')pieces.push(b);left-=b.length;}
  if(size%512)await take(512-size%512);members.set(name,{size,sha256:h.digest('hex')});if(name==='manifest.jsonl'){const b=new Uint8Array(size);let p=0;for(const part of pieces){b.set(part,p);p+=part.length;}manifest=decoder.decode(b);}
 }
 // Consume decompressor to verify gzip CRC and reject nonzero trailing tar data.
 while(!eof){if(pending.some(x=>x!==0))throw Error('trailing tar bytes');pending=new Uint8Array(0);const r=await reader.read();if(r.done)eof=true;else{expanded+=r.value.length;if(expanded>512*1024**2+1024*1024)throw Error('expanded archive limit');pending=r.value;}}
 if(pending.some(x=>x!==0)||longPath||Object.keys(pax).length)throw Error('trailing archive state');
 if(!members.has('manifest.jsonl'))throw Error('manifest missing');const records=manifest.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x));const primaries=records.filter(r=>r.role!=='context');const pconv=new Set(primaries.map(r=>typeof r.conversation==='string'&&r.conversation?r.conversation:r.file));if(!pconv.size||pconv.size>50||records.length>248)throw Error('requires 1-50 primary conversations');const seen=new Set();
 for(const r of records){const m=members.get(r.file);if(!safe(r.file)||r.file==='manifest.jsonl'||r.file==='summary.txt'||seen.has(r.file)||!m||!Number.isSafeInteger(r.bytes)||m.size!==r.bytes||m.sha256!==r.sha256)throw Error('manifest mismatch');seen.add(r.file);}
 for(const name of members.keys())if(!seen.has(name)&&name!=='manifest.jsonl'&&name!=='summary.txt')throw Error('unmanifested member');
 return {sessions:pconv.size,primary_files:primaries.length,context_files:records.length-primaries.length,expanded_bytes:total,members:members.size};
 }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
}
