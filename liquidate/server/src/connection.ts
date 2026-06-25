/**
 * A thin abstraction over a client's WebSocket, so the matchmaker and room work
 * against an interface (easy to reason about, and not tied to `ws`).
 */

import type { WebSocket } from 'ws';
import { encode, type ServerMessage } from '@liquidate/shared';

export interface Connection {
  readonly id: string;
  send(msg: ServerMessage): void;
  isOpen(): boolean;
  close(): void;
}

const OPEN = 1; // ws.OPEN

export function makeConnection(id: string, socket: WebSocket): Connection {
  return {
    id,
    send(msg) {
      if (socket.readyState === OPEN) socket.send(encode(msg));
    },
    isOpen() {
      return socket.readyState === OPEN;
    },
    close() {
      socket.close();
    },
  };
}
