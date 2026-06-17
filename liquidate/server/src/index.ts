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
  MAPS,
  RECONNECT_GRACE_MS,
  RESPAWN_DELAY,
  SERVER_PORT,
  TARGET_KILLS,
  TICK_RATE,
  decode,
  encode,
  randomMap,
  type ClientMessage,
  type GameMap,
  type InitMessage,
} from '@liquidate/shared';
import { makeConnection } from './connection';
import { Matchmaker } from './matchmaker';
import { Bank } from './bank';
import { makeSession, sendAccount, sendTreasury } from './session';
import { log } from './logger';

const PORT = Number(process.env.PORT ?? SERVER_PORT);

// Match rules, overridable via env (used to keep the integration test fast and
// deterministic).
const targetKills = Number(process.env.TARGET_KILLS) || TARGET_KILLS;
const respawnDelay = Number(process.env.RESPAWN_DELAY) || RESPAWN_DELAY;
const graceMs = Number(process.env.RECONNECT_GRACE_MS) || RECONNECT_GRACE_MS;
const forcedMap: GameMap | undefined = process.env.MAP ? MAPS[process.env.MAP] : undefined;
const pickMap = (): GameMap => forcedMap ?? randomMap();
const initMap = forcedMap ?? DEFAULT_MAP;

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

const bank = new Bank(process.env.LIQUIDATE_DB ?? 'data/liquidate.sqlite');
const matchmaker = new Matchmaker(bank, pickMap, { targetKills, respawnDelay }, graceMs);

wss.on('connection', (socket: WebSocket) => {
  const id = randomUUID();
  const conn = makeConnection(id, socket);
  const session = makeSession(conn);
  log.info('ws_connect', { conn: id });

  const init: InitMessage = { type: 'init', id, tickRate: TICK_RATE, map: initMap };
  socket.send(encode(init));
  sendTreasury(conn, bank);

  // Server-measured RTT (for lag compensation): ping the client periodically and
  // time the pong.
  const rttTimer = setInterval(() => conn.send({ type: 'ping', t: Date.now() }), 1000);

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = decode<ClientMessage>(raw.toString());
    } catch {
      return; // ignore malformed input
    }

    switch (msg.type) {
      case 'ping':
        conn.send({ type: 'pong', t: msg.t });
        return;
      case 'pong': {
        const rtt = Date.now() - msg.t;
        session.rtt = session.rtt === 0 ? rtt : session.rtt * 0.8 + rtt * 0.2;
        return;
      }
      case 'login': {
        const acct = bank.loginOrCreate(msg.handle);
        session.accountId = acct.id;
        session.handle = acct.handle;
        log.info('login', { conn: id, account: acct.id, handle: acct.handle });
        matchmaker.tryReconnect(session); // resume a paused match, if any
        sendAccount(conn, bank, acct.id);
        sendTreasury(conn, bank);
        return;
      }
      case 'deposit':
        if (session.accountId) {
          bank.deposit(session.accountId, msg.amount);
          sendAccount(conn, bank, session.accountId);
          sendTreasury(conn, bank);
        }
        return;
      case 'withdraw':
        if (session.accountId) {
          bank.withdraw(session.accountId, msg.amount);
          sendAccount(conn, bank, session.accountId);
          sendTreasury(conn, bank);
        }
        return;
      case 'queue':
        matchmaker.enqueue(session, msg.stake);
        return;
      default:
        matchmaker.route(conn, msg);
    }
  });

  socket.on('close', () => {
    clearInterval(rttTimer);
    log.info('ws_disconnect', { conn: id });
    matchmaker.remove(session);
  });

  socket.on('error', (err) => {
    log.error('ws_error', { conn: id, message: err.message });
  });
});

httpServer.listen(PORT, () => {
  log.info('listening', { port: PORT, tickRate: TICK_RATE });
});

function shutdown(): void {
  log.info('shutdown');
  wss.close();
  httpServer.close(() => process.exit(0));
  // Failsafe if connections linger.
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
