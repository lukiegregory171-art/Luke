/**
 * Matchmaking: connections wait in a queue and are paired into 1v1 rooms. A
 * connection is queued automatically once it has been sent `init`; when two are
 * waiting they are popped into a Room. Messages and disconnects are routed to a
 * connection's current room.
 */

import type { ClientMessage, GameMap } from '@liquidate/shared';
import type { Connection } from './connection';
import { Room, type RoomOptions } from './room';

export class Matchmaker {
  private readonly queue: Connection[] = [];
  private readonly roomByConn = new Map<string, Room>();

  constructor(
    private readonly map: GameMap,
    private readonly opts: RoomOptions,
  ) {}

  /** Enqueue a freshly connected client and try to start a match. */
  add(conn: Connection): void {
    conn.send({ type: 'waiting' });
    this.queue.push(conn);
    this.tryMatch();
  }

  /** Route an in-match message to the connection's room (if any). */
  route(conn: Connection, msg: ClientMessage): void {
    this.roomByConn.get(conn.id)?.handleMessage(conn, msg);
  }

  /** Handle a disconnect: drop from queue or forfeit the active match. */
  remove(conn: Connection): void {
    const i = this.queue.indexOf(conn);
    if (i >= 0) this.queue.splice(i, 1);
    this.roomByConn.get(conn.id)?.handleDisconnect(conn);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  private tryMatch(): void {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      // Skip any that dropped while waiting; keep the other in the queue.
      if (!a.isOpen()) {
        if (b.isOpen()) this.queue.unshift(b);
        continue;
      }
      if (!b.isOpen()) {
        if (a.isOpen()) this.queue.unshift(a);
        continue;
      }

      const room = new Room(a, b, this.map, this.opts, () => {
        this.roomByConn.delete(a.id);
        this.roomByConn.delete(b.id);
      });
      this.roomByConn.set(a.id, room);
      this.roomByConn.set(b.id, room);
      room.start();
    }
  }
}
