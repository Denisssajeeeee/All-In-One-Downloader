// api/dl.js — Vercel streaming download proxy
module.exports = async function handler(req, res) {
  const { url, name } = req.query || {};
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).send('Invalid url');
  }
  const filename = (name || 'download').replace(/[^\w.\-]+/g, '_').slice(0, 180);

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(upstream.status || 502).send('Upstream error');
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(502).send('Proxy error: ' + e.message);
    else res.end();
  }
};
