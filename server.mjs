#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = parseInt(process.env.PORT ?? '10000', 10);
const HOST = '0.0.0.0';

// ❗ Set this in Render → Environment → XERO_WEBHOOK_KEY
const XERO_WEBHOOK_KEY = process.env.XERO_WEBHOOK_KEY || '';

function isValidXeroSignature(rawBodyBuf, headerVal) {
  if (!XERO_WEBHOOK_KEY || !headerVal) return false;
  const computed = crypto
    .createHmac('sha256', XERO_WEBHOOK_KEY)
    .update(rawBodyBuf)
    .digest('base64');

  const a = Buffer.from(String(headerVal), 'utf8');
  const b = Buffer.from(computed, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/up')) {
    res.writeHead(200, { 'Content-Length': 2 });
    return res.end('ok');
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end();
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const text = raw.toString('utf8');
    const url = new URL(req.url, 'http://local');

    const sigHeader = req.headers['x-xero-signature'] || req.headers['X-Xero-Signature'];
    const valid = isValidXeroSignature(raw, sigHeader);

    const payload = {
      receivedAt: new Date().toISOString(),
      route: url.pathname,
      validSignature: valid,
      method: req.method,
      headers: req.headers,
      bodyText: text,
      bodyBase64: raw.toString('base64'),
      bodyLength: raw.length
    };

    console.log('Webhook ->', JSON.stringify(payload));

    res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });

  req.on('error', () => {
    res.statusCode = 400;
    res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
