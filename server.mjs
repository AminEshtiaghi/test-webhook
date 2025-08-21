#!/usr/bin/env node
import http from 'node:http';

const PORT = parseInt(process.env.PORT ?? '10000', 10); // Render default
const HOST = '0.0.0.0';

const server = http.createServer((req, res) => {
  // Health check for Render
  if (req.method === 'GET' && (req.url === '/' || req.url === '/up')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const bodyText = raw.toString('utf8');

    const record = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: bodyText,
      bodyBase64: raw.toString('base64'),
      length: raw.length
    };

    // Log everything to stdout (shows up in Render logs)
    console.log('Webhook ->', JSON.stringify(record));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
    res.statusCode = 400;
    res.end('bad request');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
