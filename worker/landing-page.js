// Public landing page served at GET / by both the launcher worker and the
// receiver worker. Static HTML with inline CSS; no scripts, no external assets
// beyond the receiver's own /reckon-wordmark.svg. Deliberately a plain,
// one-column page of text and lists: a next step from the install flow, not a
// marketing template or dashboard.
export const INSTALL_COMMAND='curl -fsSL https://reckon-intake.aarizvi06.workers.dev/install.sh | bash';

export const REPO_URL='https://github.com/Archdiner/reckon-intake';

// Shared by the landing page and the signed-in page so both state exactly the
// same facts. Keep every sentence traceable to the READMEs or the product
// owner's stated commitments; add no other privacy claims.
export const SESSIONS_FACTS_HTML=`<p>The collector runs on your machine. The collector does not modify your original files. It uploads a copy of the transcript content with detected key-like values replaced by stars. Masking can miss secrets, and names, emails, personal information and code remain readable in the uploaded copy.</p>
<ul>
<li>Masking is deterministic local pattern matching, with no network calls.</li>
<li>Your masked copy goes to private storage operated by the person running the pilot. A real person reads it to write your findings. It is not sold, shared, or made public.</li>
<li>The pilot allows one upload per account, with small caps on accounts and upload size.</li>
<li>The collector code is <a href="${REPO_URL}">public</a>, so you can read exactly what runs and what leaves your machine.</li>
</ul>
<p>Self-serve deletion and automatic retention limits are not built into this pilot yet. It is run by one operator - the person who gave you the install command - and you can reach them directly.</p>`;

export const PAGE_STYLE=`
:root{--accent:#087f9c;--ink:#1b1f23;--muted:#57606a;--line:#d8dee4;--bg:#ffffff;--soft:#f5f7f9}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:32px 16px 72px}
header{display:flex;align-items:center;justify-content:space-between;gap:16px}
header img{display:block;height:24px;width:auto}
a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h1{font-size:1.6rem;line-height:1.3;font-weight:650;margin:56px 0 16px}
h2{font-size:1.1rem;font-weight:650;margin:48px 0 8px}
p{margin:0 0 14px}
ol,ul{padding-left:1.3rem;margin:0 0 14px}
li{margin:0 0 10px}
pre{margin:16px 0;padding:14px 16px;background:var(--soft);border:1px solid var(--line);border-radius:4px}
code{font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre code{display:block;user-select:all;-webkit-user-select:all;white-space:pre-wrap;overflow-wrap:anywhere}
.quiet{color:var(--muted);font-size:.92rem}
footer{margin-top:64px;padding-top:16px;border-top:1px solid var(--line);font-size:.92rem;color:var(--muted)}
@media (max-width:480px){body{font-size:16px}h1{font-size:1.4rem;margin-top:40px}h2{margin-top:40px}code{font-size:13px}}
`;

export const LANDING_PAGE=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reckon</title>
<meta name="description" content="Reckon shows you how you actually work with AI, from sessions you already have. One upload, then findings come to you.">
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
<header>
<a href="/" aria-label="Reckon home"><img src="/reckon-wordmark.svg" alt="Reckon" width="108" height="24"></a>
<a href="/browser/app">Sign in</a>
</header>
<main>
<h1>Reckon shows you how you actually work with AI.</h1>
<p>What you decided, what you handed to the agent, and what happened next. It works from sessions you already have on your computer. You upload once, and findings come back to you. There is nothing to keep up with.</p>
<p>It is for anyone who uses AI chatbots or coding tools and wants to stay sharp, not dependent.</p>

<h2 id="get">Get the collector</h2>
<p>Run this in a terminal on macOS or Linux:</p>
<pre><code>${INSTALL_COMMAND}</code></pre>
<p class="quiet">Click the command to select all of it. The script is public, so you can read it before you run it.</p>

<h2>What happens after you run it</h2>
<ol>
<li>The command collects your newest local AI sessions, masks key-like secrets in a copy, and uploads only the masked copy.</li>
<li>We read it and write findings.</li>
<li>You read the findings on your private page and decide what, if anything, to do differently.</li>
</ol>
<p>Findings are observations and hypotheses about your sessions, not verdicts.</p>

<h2 id="sessions">What happens to your sessions</h2>
${SESSIONS_FACTS_HTML}

<h2>What it reads today</h2>
<p>Today the collector supports local coding assistants: Claude Code, Codex, Cursor, Gemini, Antigravity, OpenCode, VS Code Copilot and Pi. Support for more session sources, such as general chatbots, is planned.</p>

<h2>What it is not</h2>
<p>No scores, no rankings, no dependency meter, no surveillance, no guilt trips.</p>

<h2>Already ran it?</h2>
<p><a href="/browser/app">Sign in</a> with the same email you used in the terminal to see what you sent and what came back.</p>
</main>
<footer>
<p>Reckon is a research pilot.</p>
</footer>
</div>
</body>
</html>
`;

export const HTML_HEADERS={
 'content-type':'text/html; charset=utf-8',
 'x-content-type-options':'nosniff',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
 'referrer-policy':'no-referrer',
};

export function landingResponse(){
 return new Response(LANDING_PAGE,{headers:{...HTML_HEADERS,'cache-control':'public, max-age=300'}});
}
