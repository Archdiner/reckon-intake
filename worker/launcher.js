// reckon-intake launcher worker: the public entry point.
// Serves nothing itself; it redirects the stable public URL to the receiver
// worker so the receiver hostname can change without breaking installs.
// Deploy with: wrangler deploy -c reckon-intake.example.json (after copying it
// to your own config with your account_id and setting "main": "launcher.js").
export default {
  fetch(request) {
    const path = new URL(request.url).pathname;
    return request.method === 'GET' && ['/install.sh', '/reckon-wordmark.svg', '/health', '/'].includes(path)
      ? Response.redirect('https://paxel-intake.aarizvi06.workers.dev' + path, 302)
      : new Response('Not found', { status: 404 });
  },
};
