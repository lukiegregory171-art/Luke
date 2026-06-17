/**
 * Matchmaking + economy glue. Logged-in sessions queue with a demo stake and are
 * paired into 1v1 Rooms. The effective stake is min(both stakes); it is escrowed
 * from each account at match start and settled (winner credited pot - rake, rake
 * to the treasury) when the Room ends. The server is the sole balance authority.
 */

import type { ClientMessage, GameMap } from '@liquidate/shared';
import type { Connection } from './connection';
import type { Bank } from './bank';
import { Room, type RoomOptions } from './room';
import { sendAccount, sendTreasury, type Session } from './session';

export class Matchmaker {
  private readonly queue: Session[] = [];
  private readonly roomByConn = new Map<string, Room>();

  constructor(
    private readonly bank: Bank,
    private readonly pickMap: () => GameMap,
    private readonly opts: RoomOptions,
  ) {}

  /** Enqueue a logged-in session with a validated stake. */
  enqueue(session: Session, rawStake: number): void {
    const acct = session.accountId ? this.bank.get(session.accountId) : undefined;
    if (!acct) return; // must be logged in
    if (this.roomByConn.has(session.conn.id) || this.queue.includes(session)) return;
    session.stake = Math.max(0, Math.min(Math.floor(rawStake) || 0, acct.balance));
    session.conn.send({ type: 'waiting' });
    this.queue.push(session);
    this.tryMatch();
  }

  /** Route an in-match message to the connection's room (if any). */
  route(conn: Connection, msg: ClientMessage): void {
    this.roomByConn.get(conn.id)?.handleMessage(conn, msg);
  }

  /** A connection dropped: leave the queue, or forfeit an active match. */
  remove(session: Session): void {
    const i = this.queue.indexOf(session);
    if (i >= 0) this.queue.splice(i, 1);
    this.roomByConn.get(session.conn.id)?.handleDisconnect(session.conn);
  }

  get queueLength(): number {
    return this.queue.length;
  }

  private tryMatch(): void {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      if (!a.conn.isOpen()) {
        if (b.conn.isOpen()) this.queue.unshift(b);
        continue;
      }
      if (!b.conn.isOpen()) {
        if (a.conn.isOpen()) this.queue.unshift(a);
        continue;
      }
      this.startMatch(a, b);
    }
  }

  private startMatch(a: Session, b: Session): void {
    const stake = Math.min(a.stake, b.stake);

    // Escrow the stake from each account (held as the pot until settled).
    if (stake > 0 && a.accountId && b.accountId) {
      this.bank.escrow(a.accountId, stake);
      this.bank.escrow(b.accountId, stake);
      sendAccount(a.conn, this.bank, a.accountId);
      sendAccount(b.conn, this.bank, b.accountId);
    }

    const room = new Room(
      a.conn,
      b.conn,
      this.pickMap(),
      this.opts,
      stake,
      (winnerConnId, scores) => this.settle(a, b, stake, winnerConnId, scores),
    );
    this.roomByConn.set(a.conn.id, room);
    this.roomByConn.set(b.conn.id, room);
    room.start();
  }

  private settle(
    a: Session,
    b: Session,
    stake: number,
    winnerConnId: string | null,
    scores: Record<string, number>,
  ): void {
    this.roomByConn.delete(a.conn.id);
    this.roomByConn.delete(b.conn.id);

    if (a.accountId && b.accountId) {
      if (winnerConnId === null) {
        if (stake > 0) {
          this.bank.refund(a.accountId, stake);
          this.bank.refund(b.accountId, stake);
        }
      } else {
        const winner = winnerConnId === a.conn.id ? a : b;
        const loser = winner === a ? b : a;
        this.bank.settle(
          winner.accountId!,
          loser.accountId!,
          stake,
          scores[winner.conn.id] ?? 0,
          scores[loser.conn.id] ?? 0,
        );
      }
      sendAccount(a.conn, this.bank, a.accountId);
      sendAccount(b.conn, this.bank, b.accountId);
      sendTreasury(a.conn, this.bank);
      sendTreasury(b.conn, this.bank);
    }
  }
}
