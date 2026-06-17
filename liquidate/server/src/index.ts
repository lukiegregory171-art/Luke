/**
 * LIQUIDATE authoritative server.
 *
 * Serves the client over plain HTTP and runs the authoritative game over
 * WebSockets: on connect a client gets `init` (id + world + tick rate) and is
 * queued by the matchmaker, which pairs players into 1v1 rooms. Rooms own all
 * simulation, hit detection, and outcomes — clients only ever send inputs.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_MAP,
  RESPAWN_DELAY,
  SERVER_PORT,
  TARGET_KILLS,
  TICK_RATE,
  decode,
  encode,
  type ClientMessage,
  type InitMessage,
} from '@liquidate/shared';
import { makeConnection } from './connection';
import { Matchmaker } from './matchmaker';

const PORT = Number(process.env.PORT ?? SERVER_PORT);

// Match rules, overridable via env (used to keep the integration test fast).
const targetKills = Number(process.env.TARGET_KILLS) || TARGET_KILLS;
const respawnDelay = Number(process.env.RESPAWN_DELAY) || RESPAWN_DELAY;

// In production the server can serve the built client. In dev, Vite serves it,
// so this directory simply won't exist — that's fine.
const CLIENT_DIST = resolve(fileURLToPath(new URL('../../client/dist', import.meta.url)));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0];

  if (url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tickRate: TICK_RATE }));
    return;
  }

  if (!existsSync(CLIENT_DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('LIQUIDATE server running. In dev, open the Vite client (npm run dev).');
    return;
  }

  // Resolve the request path safely inside CLIENT_DIST (no traversal).
  const relative = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(CLIENT_DIST, relative);
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback to index.html.
    filePath = join(CLIENT_DIST, 'index.html');
  }

  try {
    const body = readFileSync(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const httpServer = createServer(serveStatic);
// Attach the WebSocket server to the `/ws` path so it can share the port with
// HTTP static serving, and so a dev proxy (Vite) can forward just this path.
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const matchmaker = new Matchmaker(DEFAULT_MAP, { targetKills, respawnDelay });

wss.on('connection', (socket: WebSocket) => {
  const id = randomUUID();
  const conn = makeConnection(id, socket);
  console.log(`[ws] connected ${id}`);

  const init: InitMessage = { type: 'init', id, tickRate: TICK_RATE, map: DEFAULT_MAP };
  socket.send(encode(init));
  matchmaker.add(conn);

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = decode<ClientMessage>(raw.toString());
    } catch {
      return; // ignore malformed input
    }

    if (msg.type === 'ping') {
      conn.send({ type: 'pong', t: msg.t });
      return;
    }
    matchmaker.route(conn, msg);
  });

  socket.on('close', () => {
    console.log(`[ws] disconnected ${id}`);
    matchmaker.remove(conn);
  });

  socket.on('error', (err) => {
    console.error(`[ws] error ${id}:`, err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[liquidate] server listening on http://localhost:${PORT} (tick ${TICK_RATE}Hz)`);
});

function shutdown(): void {
  console.log('[liquidate] shutting down');
  wss.close();
  httpServer.close(() => process.exit(0));
  // Failsafe if connections linger.
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
