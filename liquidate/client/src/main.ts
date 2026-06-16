/**
 * M0 client: connect to the server over WebSocket and log the `init` handshake.
 * The Three.js renderer, input, prediction, and HUD all arrive in later
 * milestones — for now this just proves the client and server talk.
 */

import { SERVER_PORT, decode, type ServerMessage } from '@liquidate/shared';

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

// In dev the Vite client and the WS server run on different ports, so connect
// to the server explicitly on SERVER_PORT.
const wsUrl = `ws://${location.hostname}:${SERVER_PORT}`;
log(`connecting to ${wsUrl}`);

const socket = new WebSocket(wsUrl);

socket.addEventListener('open', () => {
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
  setStatus('disconnected', 'err');
  log('socket closed');
});

socket.addEventListener('error', () => {
  setStatus('connection error — is the server running? (npm run dev)', 'err');
  log('socket error');
});
