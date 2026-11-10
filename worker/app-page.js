// Signed-in page served at GET /browser/app by the receiver worker.
// Reads like a receipt or a short letter, not a dashboard: what you sent, what
// came back, what happens next. One column of plain text and lists; every
// dynamic value is escaped.
import {PAGE_STYLE,HTML_HEADERS,SESSIONS_FACTS_HTML} from './landing-page.js';

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

export function renderAppPage({email,reckonId,uploads=[],findings=[]}){
 return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Your Reckon page</title>
<style>${PAGE_STYLE}</style>
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
 return new Response(renderAppPage(data),{headers:{...HTML_HEADERS,'cache-control':'private, no-store'}});
}
