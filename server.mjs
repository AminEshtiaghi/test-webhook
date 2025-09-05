#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = parseInt(process.env.PORT ?? '10000', 10);
const HOST = '0.0.0.0';

// ❗ Set this in Render → Environment → XERO_WEBHOOK_KEY
const XERO_WEBHOOK_KEY = process.env.XERO_WEBHOOK_KEY || '';

// Optional: limit how much of the body we print (default 64KB)
const LOG_TRUNCATE_BYTES = parseInt(process.env.LOG_TRUNCATE_BYTES ?? '65536', 10);

// --- helpers ---------------------------------------------------------------

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

function redactHeaders(headers) {
  const out = { ...headers };
  for (const key of ['authorization', 'cookie']) {
    if (key in out) out[key] = '[redacted]';
  }
  return out;
}

function safePreview(str, limit) {
  if (str.length <= limit) return str;
  return str.slice(0, limit) + `… [truncated ${str.length - limit} bytes]`;
}

function maybeParseBody(text, contentType = '') {
  try {
    if (contentType.includes('application/json')) {
      return JSON.parse(text);
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }
  } catch {
    // fall through if parsing fails
  }
  return null;
}

// --- server ---------------------------------------------------------------

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

    const sigHeader = req.headers['x-xero-signature']; // Node lowercases header keys
    const valid = isValidXeroSignature(raw, sigHeader);
    const contentType = req.headers['content-type'] || '';
    const parsedBody = maybeParseBody(text, contentType);

    // === Separate, readable logs ===
    console.log('\n=== REQUEST HEADERS ===');
    console.dir(redactHeaders(req.headers), { depth: null });

    console.log('=== RAW BODY BASE64 ===');
    console.log(raw.toString('base64'));   // safest to replay
    console.log('=== REQUEST BODY (raw) ===');
    console.log(safePreview(text, LOG_TRUNCATE_BYTES));

    if (parsedBody !== null) {
      console.log('=== REQUEST BODY (parsed) ===');
      console.dir(parsedBody, { depth: null });
    }

    // Existing payload echo (kept as-is for compatibility)
    const payload = {
      receivedAt: new Date().toISOString(),
      route: url.pathname,
      validSignature: valid,
      method: req.method,
      headers: req.headers, // note: not redacted in response; redact if you prefer
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
