const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const handler = require('./api/aio.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

async function handleDownloadProxy(req, res, query) {
  const target = query.url;
  const name = (query.name || 'download').replace(/[^\w.\-]+/g, '_').slice(0, 180);
  if (!target || !/^https?:\/\//i.test(target)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Invalid url');
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      'Accept': '*/*'
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstream = await fetch(target, {
      signal: controller.signal, redirect: 'follow', headers
    });
    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      res.writeHead(upstream.status || 502, { 'Content-Type': 'text/plain' });
      return res.end('Upstream error: ' + upstream.status);
    }

    const resHeaders = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'
    };

    const upstreamLen = upstream.headers.get('content-length');
    if (upstreamLen) resHeaders['Content-Length'] = upstreamLen;

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) resHeaders['Content-Range'] = contentRange;
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) resHeaders['Accept-Ranges'] = acceptRanges;

    const statusCode = upstream.status === 206 ? 206 : 200;
    res.writeHead(statusCode, resHeaders);

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
    nodeStream.on('error', (e) => { console.error('[dl]', e.message); try { res.destroy(); } catch {} });
    req.on('close', () => { try { nodeStream.destroy(); } catch {} });
  } catch (e) {
    console.error('[dl] fetch error:', e.message);
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('Proxy error: ' + e.message); }
    else { try { res.destroy(); } catch {} }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  console.log(`[dev] ${req.method} ${pathname}`);

  if (pathname === '/api/dl') return handleDownloadProxy(req, res, Object.fromEntries(url.searchParams));

  if (pathname === '/api/aio') {
    const fakeReq = { method: req.method, query: Object.fromEntries(url.searchParams), headers: req.headers };

    const fakeRes = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(data) {
        res.writeHead(this.statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...this.headers });
        res.end(JSON.stringify(data)); return this;
      },
      send(data) {
        res.writeHead(this.statusCode, { 'Content-Type': 'text/plain; charset=utf-8', ...this.headers });
        res.end(String(data)); return this;
      },
      end() { res.end(); return this; }
    };

    try { await handler(fakeReq, fakeRes); }
    catch (e) { console.error('[api error]', e); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); } }
    return;
  }

  const requestedPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, requestedPath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not Found: ' + pathname); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  +--------------------------------------+');
  console.log('  |  AIO Downloader dev server           |');
  console.log(`  |  http://localhost:${PORT}              |`);
  console.log('  +--------------------------------------+');
  console.log('');
});