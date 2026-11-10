// reckon-intake launcher worker: the public entry point.
// Serves the public landing page at / and otherwise redirects the stable
// public URL to the receiver worker so the receiver hostname can change
// without breaking installs. /browser/* is redirected too, so the landing
// page's relative Sign in link works from the public hostname.
// Deploy with: wrangler deploy -c reckon-intake.example.json (after copying it
// to your own config with your account_id and setting "main": "launcher.js").
import {landingResponse} from './landing-page.js';
const BACKEND='https://paxel-intake.aarizvi06.workers.dev';
export default {
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/') return landingResponse();
    return request.method === 'GET' && (['/install.sh', '/reckon-wordmark.svg', '/health'].includes(path) || path.startsWith('/browser/'))
      ? Response.redirect(BACKEND + path, 302)
      : new Response('Not found', { status: 404 });
  },
};
