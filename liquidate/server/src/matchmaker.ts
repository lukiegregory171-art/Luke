/**
 * Matchmaking + economy + reconnection glue. Logged-in sessions queue with a
 * demo stake and are paired into 1v1 Rooms. The effective stake (min of both) is
 * escrowed at start and settled (winner credited pot - rake, rake to treasury)
 * at the end. On disconnect the match pauses for a grace period and the same
 * account can reconnect to resume; otherwise it forfeits. The server is the sole
 * balance authority.
 */

import type { ClientMessage, GameMap } from '@liquidate/shared';
import type { Connection } from './connection';
import type { Bank } from './bank';
import { Room, type RoomOptions } from './room';
import { sendAccount, sendTreasury, type Session } from './session';
import { log } from './logger';

interface RoomCtx {
  room: Room;
  slots: [Session, Session];
  stake: number;
  graceTimer?: ReturnType<typeof setTimeout>;
}

export class Matchmaker {
  private readonly queue: Session[] = [];
  private readonly roomByConn = new Map<string, RoomCtx>();
  private readonly pausedByAccount = new Map<string, { ctx: RoomCtx; slot: 0 | 1 }>();

  constructor(
    private readonly bank: Bank,
    private readonly pickMap: () => GameMap,
    private readonly opts: RoomOptions,
    private readonly graceMs: number,
  ) {}

  /** Enqueue a logged-in session with a validated stake. */
  enqueue(session: Session, rawStake: number): void {
    const acct = session.accountId ? this.bank.get(session.accountId) : undefined;
    if (!acct) return;
    if (this.roomByConn.has(session.conn.id) || this.queue.includes(session)) return;
    session.stake = Math.max(0, Math.min(Math.floor(rawStake) || 0, acct.balance));
    session.conn.send({ type: 'waiting' });
    this.queue.push(session);
    this.tryMatch();
  }

  /** Route an in-match message to the connection's room (if any). */
  route(conn: Connection, msg: ClientMessage): void {
    this.roomByConn.get(conn.id)?.room.handleMessage(conn, msg);
  }

  /** If this (just-logged-in) session matches a paused match, resume it. */
  tryReconnect(session: Session): boolean {
    if (!session.accountId) return false;
    const paused = this.pausedByAccount.get(session.accountId);
    if (!paused) return false;
    const { ctx, slot } = paused;
    if (ctx.graceTimer) clearTimeout(ctx.graceTimer);
    this.pausedByAccount.delete(session.accountId);
    ctx.slots[slot] = session;
    this.roomByConn.set(session.conn.id, ctx);
    ctx.room.rebind(slot, session.conn);
    log.info('reconnect', { account: session.accountId });
    return true;
  }

  /** A connection dropped: leave the queue, or pause the match (grace) / forfeit. */
  remove(session: Session): void {
    const qi = this.queue.indexOf(session);
    if (qi >= 0) this.queue.splice(qi, 1);

    const ctx = this.roomByConn.get(session.conn.id);
    if (!ctx) return;
    const slot = ctx.slots[0] === session ? 0 : 1;
    this.roomByConn.delete(session.conn.id);

    if (!session.accountId) {
      ctx.room.forfeit(slot);
      return;
    }
    ctx.room.markDisconnected(slot);
    this.pausedByAccount.set(session.accountId, { ctx, slot });
    const account = session.accountId;
    ctx.graceTimer = setTimeout(() => {
      this.pausedByAccount.delete(account);
      ctx.room.forfeit(slot);
    }, this.graceMs);
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
    const slots: [Session, Session] = [a, b];

    if (stake > 0 && a.accountId && b.accountId) {
      this.bank.escrow(a.accountId, stake);
      this.bank.escrow(b.accountId, stake);
      sendAccount(a.conn, this.bank, a.accountId);
      sendAccount(b.conn, this.bank, b.accountId);
    }

    const latencyOf = (connId: string): number => slots.find((s) => s.conn.id === connId)?.rtt ?? 0;

    // The onResult closure needs the ctx, which needs the room — break the cycle
    // with a stable holder (also keeps working across reconnects).
    const ref: { ctx?: RoomCtx } = {};
    const room = new Room(
      a.conn,
      b.conn,
      this.pickMap(),
      this.opts,
      stake,
      latencyOf,
      (winner, scores) => {
        if (ref.ctx) this.settle(ref.ctx, winner, scores);
      },
    );
    const ctx: RoomCtx = { room, slots, stake };
    ref.ctx = ctx;
    this.roomByConn.set(a.conn.id, ctx);
    this.roomByConn.set(b.conn.id, ctx);
    log.info('match_start', { a: a.accountId, b: b.accountId, stake });
    room.start();
  }

  private settle(ctx: RoomCtx, winnerConnId: string | null, scores: Record<string, number>): void {
    if (ctx.graceTimer) clearTimeout(ctx.graceTimer);
    const [a, b] = ctx.slots;
    this.roomByConn.delete(a.conn.id);
    this.roomByConn.delete(b.conn.id);
    if (a.accountId) this.pausedByAccount.delete(a.accountId);
    if (b.accountId) this.pausedByAccount.delete(b.accountId);

    if (a.accountId && b.accountId) {
      if (winnerConnId === null) {
        if (ctx.stake > 0) {
          this.bank.refund(a.accountId, ctx.stake);
          this.bank.refund(b.accountId, ctx.stake);
        }
      } else {
        const winner = winnerConnId === a.conn.id ? a : b;
        const loser = winner === a ? b : a;
        this.bank.settle(
          winner.accountId!,
          loser.accountId!,
          ctx.stake,
          scores[winner.conn.id] ?? 0,
          scores[loser.conn.id] ?? 0,
        );
      }
      for (const s of [a, b]) {
        if (s.conn.isOpen() && s.accountId) {
          sendAccount(s.conn, this.bank, s.accountId);
          sendTreasury(s.conn, this.bank);
        }
      }
    }
  }
}
