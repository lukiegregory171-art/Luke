/**
 * WebSocket transport for the networked match. Connects to `/ws` on the same
 * origin (Vite proxies it in dev, the Node server serves it in prod), forwards
 * server messages, and measures round-trip latency via ping/pong.
 */

import { decode, encode, type ClientMessage, type ServerMessage } from '@liquidate/shared';

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class Net {
  private ws?: WebSocket;
  private pingTimer?: ReturnType<typeof setInterval>;

  /** Smoothed round-trip latency in ms. */
  latency = 0;

  onMessage: (msg: ServerMessage) => void = () => {};
  onClose: () => void = () => {};

  connect(): void {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.send({ type: 'ping', t: performance.now() });
      this.pingTimer = setInterval(() => this.send({ type: 'ping', t: performance.now() }), 1000);
    });

    ws.addEventListener('message', (event) => {
      let msg: ServerMessage;
      try {
        msg = decode<ServerMessage>(event.data as string);
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        const rtt = performance.now() - msg.t;
        // Light smoothing so the readout doesn't jitter.
        this.latency = this.latency === 0 ? rtt : this.latency * 0.8 + rtt * 0.2;
        return;
      }
      if (msg.type === 'ping') {
        // The server measures our RTT for lag compensation; echo it back.
        this.send({ type: 'pong', t: msg.t });
        return;
      }
      this.onMessage(msg);
    });

    ws.addEventListener('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.onClose();
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
