import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from './gameServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const THREE_MODULE = path.join(ROOT_DIR, 'node_modules', 'three', 'build', 'three.module.js');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath === '/vendor/three.module.js') {
    fs.readFile(THREE_MODULE, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  const filePath = safeJoin(PUBLIC_DIR, urlPath);
  if (!filePath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

new GameServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Rivals-style FPS server running at http://localhost:${PORT}`);
});
