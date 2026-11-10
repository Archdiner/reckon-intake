// Signed-in page served at GET /browser/app by the receiver worker.
//
// One short screen. When a rule pass has listed candidate calls for this
// account, the page shows them as the participant's own instructions to their
// agents, and offers one action: tick the ones worth keeping and copy them as
// plain lines to paste wherever they keep standing instructions. Upload status,
// findings and the data facts sit quietly below. Every dynamic value is
// escaped; the page makes no requests of its own.
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

const SHORT_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const d=new Date(value+'T00:00:00Z');
 return Number.isNaN(d.getTime())?null:`${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function uploadLines(uploads){
 if(!uploads.length)return '<p>No upload yet. Run the collector from the <a href="/">home page</a> to send one.</p>';
 return uploads.map(u=>{
  const date=formatDate(u.date);
  return `<p>Your upload${date?' on '+date:''}: a ${escapeHtml(formatBytes(u.size))} masked archive. ${escapeHtml(STATUS_TEXT[u.status]||u.status)}</p>`;
 }).join('');
}

function findingLines(findings){
 const items=(Array.isArray(findings)?findings:[]).filter(f=>f&&typeof f.title==='string'&&f.title);
 if(!items.length)return '<p>Findings are written by hand in this pilot. None are ready yet.</p>';
 return '<p>Findings: '+items.map(f=>{
  const url=safeUrl(f.url),title=escapeHtml(f.title),date=formatDate(f.date);
  return `${url?`<a href="${escapeHtml(url)}" rel="noopener noreferrer">${title}</a>`:title}${date?` (${date})`:''}`;
 }).join('; ')+'. They are observations, not verdicts.</p>';
}

// Standing instructions picked from the participant's upload by a rule pass
// and a manual read. Entries are injected at deploy time (calls.js). Only id
// and quote are required; outcome and check fields are optional and render
// only when present.
const KEEP_PREFIX='reckon.keep.v1:';

// The only script on the page. No network, no external files. It reveals the
// checkboxes, gathers the ticked quotes into an editable box, copies that box
// to the clipboard on request, and remembers which entries are ticked in this
// browser under keys that include the account's opaque Reckon ID and the entry
// id, so another account on the same browser never inherits them. Without an
// account id it still works but remembers nothing.
export const CALLS_SCRIPT=`(function(){var root=document.getElementById("calls");if(!root)return;document.documentElement.className+=" js";
var acct=root.getAttribute("data-account"),P=acct?${JSON.stringify(KEEP_PREFIX)}+acct+":":null;
function get(k){try{return localStorage.getItem(k)==="1";}catch(e){return false;}}
function put(k,on){try{if(on)localStorage.setItem(k,"1");else localStorage.removeItem(k);}catch(e){}}
var rows=root.querySelectorAll("[data-call-id]"),panel=document.getElementById("keep"),out=document.getElementById("keep-text"),btn=document.getElementById("keep-copy");
function line(li){var q=li.querySelector(".q").textContent.replace(/\\u00a0/g," ").trim(),p=li.getAttribute("data-project");return "- "+q+(p?" ("+p+")":"");}
function sync(){var lines=[];for(var i=0;i<rows.length;i++){var cb=rows[i].querySelector("input");rows[i].classList.toggle("on",cb.checked);if(cb.checked)lines.push(line(rows[i]));}out.value=lines.join("\\n");panel.hidden=!lines.length;btn.textContent="Copy";}
for(var i=0;i<rows.length;i++)(function(li){var cb=li.querySelector("input"),k=P?P+li.getAttribute("data-call-id"):null;if(k&&get(k))cb.checked=true;cb.addEventListener("change",function(){if(k)put(k,cb.checked);sync();});})(rows[i]);
function done(){btn.textContent="Copied";}
btn.addEventListener("click",function(){var t=out.value;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){out.select();});}else{out.select();try{if(document.execCommand("copy"))done();}catch(e){}}});
sync();})();`;
export const CALLS_SCRIPT_HASH='sha256-'+createHash('sha256').update(CALLS_SCRIPT).digest('base64');

export function normalizeCalls(calls){
 return (Array.isArray(calls)?calls:[]).filter(c=>c&&typeof c.id==='string'&&c.id&&typeof c.quote==='string'&&c.quote);
}

// The extractor marks a cut quote with a trailing " …". Join it to the last
// word with a no-break space so the ellipsis never wraps onto a line alone.
const keepEllipsis=html=>html.replace(/ …$/,' …');

// An observed outcome, only when the entry actually carries one.
const outcomeOf=c=>c.status==='checked'&&c.outcome&&typeof c.outcome.text==='string'&&c.outcome.text?c.outcome:null;

function callRow(c){
 const project=typeof c.project==='string'&&c.project?c.project:'';
 const date=shortDate(c.date);
 const meta=[project?escapeHtml(project):null,date||'date unclear'].filter(Boolean).join(' &middot; ');
 const outcome=outcomeOf(c);
 let extra='';
 if(outcome){
  const src=safeHttpsUrl(outcome.source_url);
  extra=`<span class="x">${escapeHtml(outcome.text)}${src?` <a href="${escapeHtml(src)}" rel="noopener noreferrer">Source</a>`:''}</span>`;
 }else{
  const locator=c.check_target&&typeof c.check_target.locator==='string'&&c.check_target.locator?c.check_target.locator:null;
  if(locator)extra=`<span class="x">Where to check: <code>${escapeHtml(locator)}</code></span>`;
 }
 return `<li data-call-id="${escapeHtml(c.id)}" data-project="${escapeHtml(project)}"><label>
<input type="checkbox" class="pick">
<span class="body"><span class="q">${keepEllipsis(escapeHtml(c.quote))}</span>
<span class="m">${meta}</span>${extra}</span>
</label></li>`;
}

function callsBlock(calls,reckonId){
 const account=typeof reckonId==='string'&&reckonId?` data-account="${escapeHtml(reckonId)}"`:'';
 return `<section id="calls" aria-labelledby="calls-title"${account}>
<h1 id="calls-title">Things you told your agents</h1>
<p class="lede">Picked from your upload by a rule pass, then read through by hand. <span class="pick-hint">Tick the ones worth writing down once, then copy them.</span></p>
<ol class="calls">
${calls.map(callRow).join('\n')}
</ol>
${calls.some(outcomeOf)?'<p class="fine">Unless an entry shows what was observed: no outcome check is recorded here; you may have checked elsewhere.</p>\n':''}<div id="keep" class="keep" hidden>
<label for="keep-text">Ready to paste. Edit it first if you like; nothing leaves this page.</label>
<textarea id="keep-text" rows="4" spellcheck="false"></textarea>
<button type="button" id="keep-copy">Copy</button>
</div>
<script>${CALLS_SCRIPT}</script>
</section>`;
}

const APP_STYLE=`
header .who{display:flex;gap:14px;align-items:baseline;font-size:.92rem;color:var(--muted)}
h1{font-size:1.5rem;line-height:1.25;margin:44px 0 8px}
.lede{color:var(--muted);margin:0 0 20px}
.calls{list-style:none;padding:0;margin:0}
.calls li{border-top:1px solid var(--line)}
.calls li:last-child{border-bottom:1px solid var(--line)}
.calls label{display:flex;gap:14px;align-items:flex-start;padding:16px 4px;cursor:default}
.js .calls label{cursor:pointer}
.calls .pick{display:none;flex:none;width:18px;height:18px;margin:4px 0 0;accent-color:var(--accent)}
.js .calls .pick{display:block}
.pick-hint{display:none}
.js .pick-hint{display:inline}
.calls .body{display:grid;gap:4px;min-width:0}
.calls .q{font-size:1.05rem;line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap}
.calls .m,.calls .x{font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}
.calls .x code{font-size:.82rem}
.calls li.on{background:var(--soft)}
.calls li.on .q{color:var(--ink)}
.fine{font-size:.85rem;color:var(--muted);margin:12px 0 0}
.keep{position:sticky;bottom:0;margin:20px 0 0;padding:14px 0 16px;background:var(--bg);border-top:2px solid var(--accent);display:grid;gap:8px}
.keep[hidden]{display:none}
.keep label{font-size:.88rem;color:var(--muted)}
.keep textarea{width:100%;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:10px 12px;border:1px solid var(--line);border-radius:6px;resize:vertical;color:var(--ink);background:var(--bg)}
.keep button{justify-self:start;font:inherit;font-weight:600;padding:9px 20px;border:0;border-radius:999px;background:var(--accent);color:#fff;cursor:pointer}
.keep button:focus-visible,.calls .pick:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.about{margin-top:48px;padding-top:16px;border-top:1px solid var(--line);font-size:.92rem;color:var(--muted)}
.about p{margin:0 0 8px}
.about details{margin-top:12px}
.about summary{cursor:pointer;color:var(--ink)}
.about details[open] summary{margin-bottom:10px}
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
<style>${PAGE_STYLE}${APP_STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<a href="/" aria-label="Reckon home"><img src="/reckon-wordmark.svg" alt="Reckon" width="108" height="24"></a>
<span class="who"><span>${escapeHtml(email)}</span><a href="/cdn-cgi/access/logout">Sign out</a></span>
</header>
<main>
${callList.length?callsBlock(callList,reckonId):`<h1>Your Reckon page</h1>
<p class="lede">Nothing is listed for your account yet.</p>`}
<section class="about" aria-label="Your upload and your data">
${uploadLines(uploads)}
${findingLines(findings)}
<details>
<summary>What happens to your sessions</summary>
${SESSIONS_FACTS_HTML}
</details>
</section>
</main>
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
