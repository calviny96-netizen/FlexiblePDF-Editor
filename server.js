const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 4310;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let modelsCache = null;
let modelsCacheAt = 0;
const MODELS_CACHE_MS = 10 * 60 * 1000;

function proxyModels(res) {
  const now = Date.now();
  if (modelsCache && now - modelsCacheAt < MODELS_CACHE_MS) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(modelsCache);
  }

  const req = https.get('https://openrouter.ai/api/v1/models', {
    headers: { 'User-Agent': 'FlexiblePDF-Editor/1.0' },
  }, (upstream) => {
    let body = '';
    upstream.on('data', (c) => { body += c; });
    upstream.on('end', () => {
      if (upstream.statusCode >= 200 && upstream.statusCode < 300) {
        modelsCache = body;
        modelsCacheAt = now;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(body);
      } else {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'upstream_error', status: upstream.statusCode }));
      }
    });
  });
  req.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'fetch_failed', message: err.message }));
  });
  req.setTimeout(8000, () => req.destroy(new Error('timeout')));
}

function serveStatic(reqUrl, res) {
  let filePath = reqUrl === '/' ? '/index.html' : reqUrl;
  filePath = decodeURIComponent(filePath.split('?')[0]);
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));

  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found: ' + filePath);
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/api/models') {
    return proxyModels(res);
  }

  if (req.method === 'GET') {
    return serveStatic(url, res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('FlexiblePDF-Editor siap di http://localhost:' + PORT);
});
