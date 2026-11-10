// Signed-in page served at GET /browser/app by the receiver worker.
// Reads like a receipt or a short letter, not a dashboard: what you sent, what
// came back, what happens next. One column of plain text and lists; every
// dynamic value is escaped.
import {PAGE_STYLE,HTML_HEADERS,SESSIONS_FACTS_HTML} from './landing-page.js';
import {createHash} from 'node:crypto';

export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function formatBytes(n){
 if(!Number.isFinite(n)||n<0)return 'unknown size';
 if(n<1024)return n+' B';
 const units=['KB','MB','GB'];let v=n/1024,i=0;
 while(v>=1024&&i<units.length-1){v/=1024;i++;}
 return (v>=10?String(Math.round(v)):v.toFixed(1))+' '+units[i];
}

const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDate(value){
 if(typeof value!=='string'||!value)return null;
 const d=new Date(value);
 return Number.isNaN(d.getTime())?escapeHtml(value):`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function safeUrl(value){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}

// Outcome sources must be https; anything else is shown without a link.
function safeHttpsUrl(value){
 const url=safeUrl(value);
 return url&&url.startsWith('https:')?url:null;
}

const STATUS_TEXT={accepted:'Received.',finalizing:'Being checked now.',reserved:'Started, not finished yet.',expired:'Started, not finished. This attempt has expired.'};

function sentSection(uploads){
 if(!uploads.length)return '<p>Nothing yet. When you run the collector from the <a href="/">home page</a>, your upload will be listed here.</p>';
 const items=uploads.map(u=>{
  const date=formatDate(u.date);
  return `<li>${date?date+': a':'A'} ${escapeHtml(formatBytes(u.size))} masked archive. ${escapeHtml(STATUS_TEXT[u.status]||u.status)}</li>`;
 }).join('');
 return `<ul>${items}</ul>`;
}

function backSection(findings){
 const items=(Array.isArray(findings)?findings:[]).filter(f=>f&&typeof f.title==='string'&&f.title);
 if(!items.length)return '<p>Nothing yet. In this pilot, findings are written by hand. They will appear here when they are ready.</p>';
 return '<ul>'+items.map(f=>{
  const url=safeUrl(f.url),title=escapeHtml(f.title),date=formatDate(f.date);
  return `<li>${url?`<a href="${escapeHtml(url)}" rel="noopener noreferrer">${title}</a>`:title}${date?`<span class="quiet">, ${date}</span>`:''}</li>`;
 }).join('')+'</ul><p>These are observations and hypotheses about your sessions, not verdicts. You decide what, if anything, to do differently.</p>';
}


// "Calls we noticed": candidate decisions a deterministic rule pass found in
// the participant's upload. Entries are injected at deploy time (calls.js).
const CALL_TYPE_LABEL={budget_cap:'Budget or limit',merge_or_release_gate:'Merge or release gate',verification_demand:'Asked for proof',go_ahead:'Go-ahead',launch_or_scope_call:'Scope call'};
const REVIEWED_PREFIX='reckon.reviewed.v1:';

// The only script on the page. No network, no external files. "Reviewed" means
// the participant acknowledged an entry, nothing more. Each mark is stored in
// this browser under a key that includes the account's opaque Reckon ID and
// the entry id, so another account signed in on the same browser never sees
// these marks. Without an account id it stores nothing and shows no buttons.
export const CALLS_SCRIPT=`(function(){var sec=document.getElementById("calls-section");if(!sec)return;var acct=sec.getAttribute("data-account");if(!acct)return;var P=${JSON.stringify(REVIEWED_PREFIX)}+acct+":";
function get(k){try{return localStorage.getItem(k)==="1";}catch(e){return false;}}
function put(k,on){try{if(on)localStorage.setItem(k,"1");else localStorage.removeItem(k);}catch(e){}}
var items=sec.querySelectorAll("[data-call-id]");for(var i=0;i<items.length;i++)(function(li){var k=P+li.getAttribute("data-call-id"),b=li.querySelector("button.review");if(!b)return;
function show(on){li.classList.toggle("reviewed",on);b.setAttribute("aria-pressed",on?"true":"false");b.textContent=on?"Reviewed":"Mark reviewed";}
show(get(k));b.hidden=false;b.addEventListener("click",function(){var on=!get(k);put(k,on);show(on);});})(items[i]);
var note=document.getElementById("calls-local-note");if(note)note.hidden=false;})();`;
export const CALLS_SCRIPT_HASH='sha256-'+createHash('sha256').update(CALLS_SCRIPT).digest('base64');

export function normalizeCalls(calls){
 return (Array.isArray(calls)?calls:[]).filter(c=>c&&typeof c.id==='string'&&c.id&&typeof c.quote==='string'&&c.quote);
}

function callItem(c){
 const label=CALL_TYPE_LABEL[c.type]||'Call';
 const date=typeof c.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)?formatDate(c.date):null;
 const meta=[escapeHtml(label),typeof c.project==='string'&&c.project?escapeHtml(c.project):null,date||'date unclear'].filter(Boolean).join(' <span aria-hidden="true">&middot;</span> ');
 const outcome=c.status==='checked'&&c.outcome&&typeof c.outcome.text==='string'&&c.outcome.text?c.outcome:null;
 let status;
 if(outcome){
  const src=safeHttpsUrl(outcome.source_url);
  status=`<p class="call-status checked">${escapeHtml(outcome.text)}${src?` <a href="${escapeHtml(src)}" rel="noopener noreferrer">Source</a>`:''}</p>`;
 }else{
  const locator=c.check_target&&typeof c.check_target.locator==='string'&&c.check_target.locator?c.check_target.locator:null;
  status=`<p class="call-status">Not checked.${locator?` <span class="where">Where to check: <code>${escapeHtml(locator)}</code></span>`:''}</p>`;
 }
 return `<li class="call" data-call-id="${escapeHtml(c.id)}">
<p class="call-meta">${meta}</p>
<blockquote class="call-quote">${escapeHtml(c.quote)}</blockquote>
${status}
<button type="button" class="review" aria-pressed="false" hidden>Mark reviewed</button>
</li>`;
}

function callsSection(calls,reckonId){
 if(!calls.length)return '';
 const account=typeof reckonId==='string'&&reckonId?` data-account="${escapeHtml(reckonId)}"`:'';
 return `
<section aria-labelledby="calls" class="calls" id="calls-section"${account}>
<h2 id="calls">Calls we noticed in your sessions</h2>
<p>A rule pass over your upload pulled out moments that look like decisions - a budget, a merge gate, a go-ahead. Rules misread sometimes, so treat these as candidates. 'Not checked' means nobody has looked at what happened next, not that it went wrong.</p>
<ol class="call-list">
${calls.map(callItem).join('\n')}
</ol>
<p class="quiet" id="calls-local-note" hidden>Marks stay on this device, in this browser.</p>
<script>${CALLS_SCRIPT}</script>
</section>
`;
}

const CALLS_STYLE=`
.call-list{list-style:none;padding:0;margin:20px 0 14px}
.call{padding:20px 0;border-top:1px solid var(--line)}
.call:last-child{border-bottom:1px solid var(--line)}
.call-meta{margin:0 0 10px;font-size:.88rem;color:var(--muted)}
.call-quote{margin:0 0 10px;padding:2px 0 2px 16px;border-left:3px solid var(--accent);font-size:1.02rem;overflow-wrap:anywhere;white-space:pre-wrap}
.call-status{margin:0 0 10px;font-size:.95rem}
.call-status .where{color:var(--muted)}
.call-status code{font-size:.85rem;overflow-wrap:anywhere}
.review{font:inherit;font-size:.88rem;padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--ink);cursor:pointer}
.review:hover{border-color:var(--accent)}
.review:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.call.reviewed .call-meta,.call.reviewed .call-quote,.call.reviewed .call-status{opacity:.55}
.call.reviewed .review{color:var(--muted)}
`;

export function renderAppPage({email,reckonId,uploads=[],findings=[],calls=[]}){
 const callList=normalizeCalls(calls);
 return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Your Reckon page</title>
<style>${PAGE_STYLE}${callList.length?CALLS_STYLE:''}</style>
</head>
<body>
<div class="wrap">
<header>
<a href="/" aria-label="Reckon home"><img src="/reckon-wordmark.svg" alt="Reckon" width="108" height="24"></a>
<a href="/cdn-cgi/access/logout">Sign out</a>
</header>
<main>
<h1>Your Reckon page</h1>
<p>You are signed in as ${escapeHtml(email)}.</p>

<section aria-labelledby="sent">
<h2 id="sent">What you sent</h2>
${sentSection(uploads)}
</section>
${callsSection(callList,reckonId)}
<section aria-labelledby="back">
<h2 id="back">What came back</h2>
${backSection(findings)}
</section>

<section aria-labelledby="next">
<h2 id="next">What happens next</h2>
<ul>
<li>The pilot is testing which reflections actually change how people work.</li>
<li>Support for more session sources is planned.</li>
</ul>
</section>

<section aria-labelledby="sessions">
<h2 id="sessions">What happens to your sessions</h2>
${SESSIONS_FACTS_HTML}
</section>
</main>
<footer><p>This page is private to your account. <a href="/cdn-cgi/access/logout">Sign out</a></p></footer>
</div>
</body>
</html>
`;
}

export function appResponse(data){
 const headers={...HTML_HEADERS,'cache-control':'private, no-store'};
 // Allow exactly the one inline script, by hash, and only when it is on the page.
 if(normalizeCalls(data?.calls).length)headers['content-security-policy']=HTML_HEADERS['content-security-policy']+`; script-src '${CALLS_SCRIPT_HASH}'`;
 return new Response(renderAppPage(data),{headers});
}
