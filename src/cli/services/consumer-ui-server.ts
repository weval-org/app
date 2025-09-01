import http from 'http';
import { parse } from 'url';

export type ConsumerUIServerOptions = {
  deckXml: string;
  port?: number;
  token: string;
  variantLabel?: string; // e.g., "System Variant 0" / the actual system text preview
  onSubmit: (responsesXml: string) => Promise<{ ok: boolean; error?: string }>;
  onClose?: () => void;
};

function html(deck: string, token: string, variantLabel?: string): string {
  const escapedDeck = deck.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const b64 = Buffer.from(deck, 'utf8').toString('base64');
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Consumer Deck</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:16px;max-width:980px;margin:0 auto}
pre{white-space:pre-wrap;border:1px solid #d0d7de;border-radius:8px;padding:12px;background:#f6f8fa}
textarea{width:100%;min-height:260px;border:1px solid #d0d7de;border-radius:8px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
button{padding:8px 12px;border-radius:8px;border:1px solid #1f2328;background:#1f2328;color:#fff;cursor:pointer}
button.secondary{background:#fff;color:#1f2328}
.row{margin:16px 0}
.muted{color:#57606a;font-size:12px}
.ok{color:#1a7f37}
.err{color:#d1242f}
.toolbar{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px}
.stats{font-size:12px;color:#57606a}
</style>
</head>
<body>
  <h1>Consumer Deck${variantLabel ? ' · ' + variantLabel : ''}</h1>
  <div class="row">
    <div class="muted">Copy this entire deck into the consumer application, run it, then paste the single combined output below.</div>
    <pre id="deck">${escapedDeck}</pre>
    <div class="toolbar">
      <button id="copy">Copy deck</button>
      <button id="download" class="secondary">Download deck</button>
      <span class="stats" id="deckStats"></span>
    </div>
  </div>
  <form id="form" method="POST" action="/submit">
    <input type="hidden" name="token" value="${token}" />
    <div class="row"><textarea id="responses" name="responses" placeholder="Paste <responses>...</responses>"></textarea></div>
    <div class="row"><button type="submit">Submit</button></div>
    <div class="row"><div id="msg" class="muted"></div></div>
  </form>
  <div class="row muted">This page is local-only and will close automatically after a successful submit.</div>
<script>
(function(){
  // Raw deck available for copy/download
  const RAW_DECK = (function(){ try { return atob('${b64}'); } catch(e){ return ''; } })();
  const deckEl = document.getElementById('deck');
  const copyBtn = document.getElementById('copy');
  const dlBtn = document.getElementById('download');
  const stats = document.getElementById('deckStats');
  const ta = document.getElementById('responses');
  const msg = document.getElementById('msg');
  const form = document.getElementById('form');

  function updateStats(){
    const len = RAW_DECK.length;
    const prompts = RAW_DECK.match(/<prompt\s+id="/g);
    stats.textContent = len + ' chars · ' + (prompts ? prompts.length : 0) + ' prompts';
  }
  updateStats();

  copyBtn.addEventListener('click', async function(){
    const text = RAW_DECK;
    try{
      await navigator.clipboard.writeText(text);
      msg.className = 'ok';
      msg.textContent = 'Deck copied to clipboard.';
    }catch(e){
      msg.className = 'err';
      msg.textContent = 'Copy failed. Select and copy manually.';
    }
  });

  dlBtn.addEventListener('click', function(){
    const blob = new Blob([RAW_DECK], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'deck.xml';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  form.addEventListener('submit', function(ev){
    const t = ta.value.trim();
    if(!t){
      ev.preventDefault();
      msg.className = 'err';
      msg.textContent = 'Please paste the <responses>...</responses> block.';
      return;
    }
    if(!/<responses[\s\S]*?>[\s\S]*<\/responses>/i.test(t)){
      ev.preventDefault();
      msg.className = 'err';
      msg.textContent = 'Missing <responses> wrapper.';
      return;
    }
    msg.className='muted';
    msg.textContent='Submitting...';
  });
})();
</script>
</body></html>`;
}

export function startConsumerUIServer(opts: ConsumerUIServerOptions): Promise<{ url: string; close: () => Promise<void> }>
{
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const { pathname } = parse(req.url || '/', true);
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html(opts.deckXml, opts.token, opts.variantLabel));
        return;
      }
      if (req.method === 'POST' && pathname === '/submit') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const params = new URLSearchParams(body);
          const token = params.get('token') || '';
          const responses = params.get('responses') || '';
          if (token !== opts.token) {
            res.writeHead(403, { 'content-type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
          const result = await opts.onSubmit(responses);
          if (result.ok) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<p class="ok">Received. You may close this tab.</p>');
            setTimeout(() => { server.close(() => opts.onClose?.()); }, 500);
          } else {
            res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`<p class="err">${(result.error || 'Validation failed').replace(/</g,'&lt;')}</p>`);
          }
        });
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
    });

    const chosenPort = opts.port || 0;
    server.listen(chosenPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address && 'port' in address ? (address as any).port : 0;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise(r => server.close(() => { opts.onClose?.(); r(); })) });
    });
  });
}


