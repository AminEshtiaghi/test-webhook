#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = parseInt(process.env.PORT ?? '10000', 10);  // Render default
const HOST = '0.0.0.0';

// ❗ Set this in Render → Environment → XERO_WEBHOOK_KEY
const XERO_WEBHOOK_KEY = process.env.XERO_WEBHOOK_KEY || '';

function isValidXeroSignature(rawBodyBuf, headerVal) {
  if (!XERO_WEBHOOK_KEY || !headerVal) return false;
  const computed = crypto
    .createHmac('sha256', XERO_WEBHOOK_KEY)
    .update(rawBodyBuf)               // raw, unmodified bytes
    .digest('base64');

  // timing-safe compare (only if equal length)
  const a = Buffer.from(headerVal, 'utf8');
  const b = Buffer.from(computed, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  // Health check for Render
  if (req.method === 'GET' && (req.url === '/' || req.url === '/up')) {
    res.writeHead(200, { 'Content-Length': 2 });
    return res.end('ok'); // small body is fine for health (Xero won’t hit this)
  }

  if (req.method !== 'POST') {
    res.statusCode = 405; // Xero sends POST webhooks
    return res.end();
  }

  // Collect RAW bytes (vital for signature verification)
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);

    const sigHeader =
      req.headers['x-xero-signature'] ||
      req.headers['X-Xero-Signature']; // just in case

    const valid = isValidXeroSignature(raw, String(sigHeader || ''));

    // Log a concise record (avoid printing huge bodies in prod)
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        method: req.method,
        url: req.url,
        validSignature: valid,
        bodyLength: raw.length,
        // For debugging you can uncomment the next line, but keep in mind logs can get large:
        // bodyText: raw.toString('utf8')
      })
    );

    // Xero requires: 200 OK for valid, 401 Unauthorized for invalid — with NO body.
    // And no cookies/extra headers. Respond fast (<5s).
    if (valid) {
      res.writeHead(200);
      res.end();
    } else {
      res.writeHead(401);
      res.end();
    }
  });

  req.on('error', () => {
    // fail closed
    res.statusCode = 400;
    res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
