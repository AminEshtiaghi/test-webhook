#!/usr/bin/env node
import http from 'http';
import fs from 'fs';

const PORT = process.env.PORT || 3000;
const LOG_FILE = process.env.LOG_FILE || 'webhooks.log';

const server = http.createServer((req, res) => {
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
            bodyBase64: raw.toString('base64')
        };

        console.log('Webhook ->', record.method, record.url, record.time);
        fs.appendFile(LOG_FILE, JSON.stringify(record) + '\n', err => {
            if (err) console.error('Log write error:', err);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    });
});

server.listen(PORT, () => {
    console.log(`Listening on http://localhost:${PORT} (logs -> ${LOG_FILE})`);
});
