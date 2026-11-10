// Signed-in app page served at GET /browser/app by the receiver worker.
// Plain server-rendered HTML; every dynamic value is escaped.
import {PAGE_STYLE,HTML_HEADERS} from './landing-page.js';

export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function formatBytes(n){
 if(!Number.isFinite(n)||n<0)return 'unknown';
 if(n<1024)return n+' B';
 const units=['KB','MB','GB'];let v=n/1024,i=0;
 while(v>=1024&&i<units.length-1){v/=1024;i++;}
 return (v>=10?String(Math.round(v)):v.toFixed(1))+' '+units[i];
}

function formatDate(value){
 if(typeof value!=='string'||!value)return 'unknown';
 const d=new Date(value);
 return Number.isNaN(d.getTime())?escapeHtml(value):d.toISOString().slice(0,10);
}

function safeUrl(value){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}

const STATUS_LABEL={accepted:'Received',finalizing:'Being checked',reserved:'Started, not finished',expired:'Not finished (expired)'};

function uploadsSection(uploads){
 if(!uploads.length)return '<p>No uploads yet. Run the collector from the <a href="/">home page</a> to send your first one.</p>';
 const rows=uploads.map(u=>`<tr><td>${formatDate(u.date)}</td><td>${escapeHtml(formatBytes(u.size))}</td><td>${escapeHtml(STATUS_LABEL[u.status]||u.status)}</td></tr>`).join('');
 return `<div class="table"><table><thead><tr><th scope="col">Date</th><th scope="col">Size</th><th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function findingsSection(findings){
 const items=(Array.isArray(findings)?findings:[]).filter(f=>f&&typeof f.title==='string'&&f.title);
 if(!items.length)return '<p>No findings yet. In this pilot, findings are written by hand. They will appear here when they are ready.</p>';
 return '<ul class="findings">'+items.map(f=>{
  const url=safeUrl(f.url),title=escapeHtml(f.title);
  const date=f.date?` <span class="meta">${formatDate(f.date)}</span>`:'';
  return `<li>${url?`<a href="${escapeHtml(url)}" rel="noopener noreferrer">${title}</a>`:title}${date}</li>`;
 }).join('')+'</ul><p class="hint">Findings are observations and hypotheses, not verdicts.</p>';
}

const APP_STYLE=`
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0 0 12px}
dt{color:var(--muted)}
dd{margin:0;overflow-wrap:anywhere}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{text-align:left;padding:8px 12px 8px 0;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:600}
.findings .meta{color:var(--muted);font-size:.9rem;white-space:nowrap}
`;

export function renderAppPage({email,reckonId,uploads=[],findings=[]}){
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
<a href="/" aria-label="Reckon home"><img src="/reckon-wordmark.svg" alt="Reckon" width="126" height="28"></a>
<nav class="nav"><a href="/cdn-cgi/access/logout">Sign out</a></nav>
</header>
<main>
<h1>Your Reckon page</h1>
<section aria-labelledby="account">
<h2 id="account">Account</h2>
<dl><dt>Signed in as</dt><dd>${escapeHtml(email)}</dd><dt>Reckon ID</dt><dd><code>${escapeHtml(reckonId)}</code></dd></dl>
</section>
<section aria-labelledby="uploads">
<h2 id="uploads">Your uploads</h2>
${uploadsSection(uploads)}
</section>
<section aria-labelledby="findings">
<h2 id="findings">What came out of it</h2>
${findingsSection(findings)}
</section>
<section aria-labelledby="next">
<h2 id="next">What's next</h2>
<ul>
<li>The pilot is testing which reflections actually change how people work.</li>
<li>Support for more session sources is planned.</li>
<li>Send feedback to the person who invited you.</li>
</ul>
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
