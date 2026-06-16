/**
 * M0 client: connect to the server over WebSocket and log the `init` handshake.
 * The Three.js renderer, input, prediction, and HUD all arrive in later
 * milestones — for now this just proves the client and server talk.
 */

import { decode, type ServerMessage } from '@liquidate/shared';

const statusEl = document.getElementById('status') as HTMLElement;
const logEl = document.getElementById('log') as HTMLElement;

function log(line: string): void {
  const stamp = new Date().toLocaleTimeString();
  logEl.textContent += `[${stamp}] ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text: string, kind: 'ok' | 'err' | '' = ''): void {
  statusEl.textContent = text;
  statusEl.className = `status${kind ? ' ' + kind : ''}`;
}

// Connect to `/ws` on the same origin as the page. The Vite dev server proxies
// this to the Node server, and the production Node server serves it directly —
// so the same URL works on localhost, in a forwarded Codespaces port, and in
// production, with no hard-coded host or port.
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProto}//${location.host}/ws`;

let reconnectAttempts = 0;
const MAX_RECONNECT = 20;

function connect(): void {
  log(`connecting to ${wsUrl}`);
  const socket = new WebSocket(wsUrl);

  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
    setStatus('connected — waiting for handshake…', 'ok');
    log('socket open');
  });

  socket.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = decode<ServerMessage>(event.data as string);
    } catch {
      log(`unparseable message: ${event.data}`);
      return;
    }

    if (msg.type === 'init') {
      console.log('[init]', msg);
      setStatus(`init received — you are ${msg.id.slice(0, 8)}… on map "${msg.map.name}"`, 'ok');
      log(
        `init: id=${msg.id} tickRate=${msg.tickRate}Hz map=${msg.map.name} (${msg.map.obstacles.length} obstacles)`,
      );
    } else {
      log(`message: ${msg.type}`);
    }
  });

  socket.addEventListener('close', () => {
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      setStatus(`disconnected — reconnecting (${reconnectAttempts})…`, 'err');
      log('socket closed; retrying in 1s');
      setTimeout(connect, 1000);
    } else {
      setStatus('disconnected — is the server running? (npm run dev)', 'err');
      log('socket closed; gave up reconnecting');
    }
  });

  socket.addEventListener('error', () => {
    log('socket error');
  });
}

connect();
