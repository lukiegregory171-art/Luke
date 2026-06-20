/**
 * Matchmaking + economy + reconnection glue.
 *
 * - DUEL (1v1): logged-in sessions queue with a demo stake and are paired. The
 *   effective stake (min of both) is escrowed at start and settled at the end
 *   (winner credited pot - rake, rake to treasury). On disconnect the match
 *   pauses for a grace period to allow reconnect; otherwise it forfeits.
 * - FFA: sessions queue into a free (no-stake) N-player room; remaining slots are
 *   filled with bots so it starts promptly and is never empty. A leaver is simply
 *   removed (no pause); the match ends when no humans remain.
 * - Empty duel lobbies are filled with a single bot after a short wait.
 *
 * The server is the sole balance authority. Bot matches (and FFA) are free, so
 * there's no economy and no stat-farming; ranked/paid play stays humans-only.
 */

import { FFA_SIZE, type ClientMessage, type GameMap, type MatchMode } from '@liquidate/shared';
import { randomUUID } from 'node:crypto';
import type { Connection } from './connection';
import type { Bank } from './bank';
import { Room } from './room';
import { makeBotConnection } from './botconnection';
import { ServerBot } from './serverbot';
import { sendAccount, sendTreasury, makeSession, type Session } from './session';
import { log } from './logger';

interface MatchmakerOptions {
  targetKills: number; // duel
  ffaTargetKills: number;
  respawnDelay: number;
}

interface RoomCtx {
  room: Room;
  slots: Session[];
  mode: MatchMode;
  stake: number;
  bots: ServerBot[];
  graceTimer?: ReturnType<typeof setTimeout>;
}

interface BotBinding {
  bot: ServerBot;
  conn: Connection;
}

export class Matchmaker {
  private readonly duelQueue: Session[] = [];
  private readonly ffaQueue: Session[] = [];
  private readonly roomByConn = new Map<string, RoomCtx>();
  private readonly pausedByAccount = new Map<string, { ctx: RoomCtx; slot: number }>();
  private readonly botFillTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private ffaFillTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly bank: Bank,
    private readonly pickMap: () => GameMap,
    private readonly opts: MatchmakerOptions,
    private readonly graceMs: number,
    private readonly botFillMs: number,
  ) {}

  /** Enqueue a logged-in session (duel by default, or free-for-all). */
  enqueue(session: Session, rawStake: number, mode: MatchMode = 'duel'): void {
    const acct = session.accountId ? this.bank.get(session.accountId) : undefined;
    if (!acct) return;
    if (this.roomByConn.has(session.conn.id)) return;
    if (this.duelQueue.includes(session) || this.ffaQueue.includes(session)) return;

    if (mode === 'ffa') {
      session.stake = 0; // FFA is free
      session.conn.send({ type: 'waiting' });
      this.ffaQueue.push(session);
      if (this.ffaQueue.length >= FFA_SIZE) this.startFfaFromQueue();
      else if (!this.ffaFillTimer) {
        this.ffaFillTimer = setTimeout(() => this.startFfaFromQueue(), this.botFillMs);
      }
      return;
    }

    session.stake = Math.max(0, Math.min(Math.floor(rawStake) || 0, acct.balance));
    session.conn.send({ type: 'waiting' });
    this.duelQueue.push(session);
    this.tryMatch();
    // Still waiting? Fill with a bot after a short delay (never empty).
    if (this.duelQueue.includes(session)) {
      this.clearBotTimer(session.conn.id);
      this.botFillTimers.set(
        session.conn.id,
        setTimeout(() => this.botFill(session), this.botFillMs),
      );
    }
  }

  /** Route an in-match message to the connection's room (if any). */
  route(conn: Connection, msg: ClientMessage): void {
    this.roomByConn.get(conn.id)?.room.handleMessage(conn, msg);
  }

  /** If this (just-logged-in) session matches a paused duel, resume it. */
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

  /** A connection dropped: leave the queue, or pause/forfeit (duel) / leave (ffa). */
  remove(session: Session): void {
    this.clearBotTimer(session.conn.id);
    const dq = this.duelQueue.indexOf(session);
    if (dq >= 0) this.duelQueue.splice(dq, 1);
    const fq = this.ffaQueue.indexOf(session);
    if (fq >= 0) this.ffaQueue.splice(fq, 1);

    const ctx = this.roomByConn.get(session.conn.id);
    if (!ctx) return;
    const slot = ctx.slots.findIndex((s) => s === session);
    this.roomByConn.delete(session.conn.id);

    if (ctx.mode === 'ffa') {
      if (slot >= 0) ctx.room.leave(slot);
      // No humans left? End the match (bots don't play to an empty room).
      const humansLeft = ctx.slots.some((s) => s.accountId && s.conn.isOpen());
      if (!humansLeft) {
        for (const b of ctx.bots) b.stop();
        ctx.room.endNoContest();
      }
      return;
    }

    // Duel.
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

  private clearBotTimer(connId: string): void {
    const t = this.botFillTimers.get(connId);
    if (t) {
      clearTimeout(t);
      this.botFillTimers.delete(connId);
    }
  }

  private tryMatch(): void {
    while (this.duelQueue.length >= 2) {
      const a = this.duelQueue.shift()!;
      const b = this.duelQueue.shift()!;
      this.clearBotTimer(a.conn.id);
      this.clearBotTimer(b.conn.id);
      if (!a.conn.isOpen()) {
        if (b.conn.isOpen()) this.duelQueue.unshift(b);
        continue;
      }
      if (!b.conn.isOpen()) {
        if (a.conn.isOpen()) this.duelQueue.unshift(a);
        continue;
      }
      this.startDuel(a, b);
    }
  }

  /** Pair a still-waiting human with a bot in a free duel. */
  private botFill(session: Session): void {
    this.clearBotTimer(session.conn.id);
    const i = this.duelQueue.indexOf(session);
    if (i < 0) return;
    this.duelQueue.splice(i, 1);
    if (!session.conn.isOpen()) return;

    const { session: botSession, binding } = this.makeBot();
    session.stake = 0; // bot matches are free
    this.createRoom([session, botSession], 'duel', 0, [binding]);
    log.info('bot_fill', { human: session.accountId });
  }

  /** Start an FFA room from the waiting queue, filling spare slots with bots. */
  private startFfaFromQueue(): void {
    if (this.ffaFillTimer) {
      clearTimeout(this.ffaFillTimer);
      this.ffaFillTimer = undefined;
    }
    const humans: Session[] = [];
    while (this.ffaQueue.length && humans.length < FFA_SIZE) {
      const s = this.ffaQueue.shift()!;
      if (s.conn.isOpen() && !this.roomByConn.has(s.conn.id)) humans.push(s);
    }
    if (humans.length === 0) return;

    const sessions: Session[] = [...humans];
    const bindings: BotBinding[] = [];
    for (let i = humans.length; i < FFA_SIZE; i++) {
      const { session, binding } = this.makeBot();
      sessions.push(session);
      bindings.push(binding);
    }
    this.createRoom(sessions, 'ffa', 0, bindings);
    log.info('ffa_start', { humans: humans.length, bots: bindings.length });

    // More humans still queued? Start forming the next room.
    if (this.ffaQueue.length > 0 && !this.ffaFillTimer) {
      this.ffaFillTimer = setTimeout(() => this.startFfaFromQueue(), this.botFillMs);
    }
  }

  private makeBot(): { session: Session; binding: BotBinding } {
    const id = 'bot-' + randomUUID();
    const bot = new ServerBot(id);
    const conn = makeBotConnection(id, (msg) => bot.onMessage(msg));
    return { session: makeSession(conn), binding: { bot, conn } };
  }

  private startDuel(a: Session, b: Session): void {
    const stake = Math.min(a.stake, b.stake);
    if (stake > 0 && a.accountId && b.accountId) {
      this.bank.escrow(a.accountId, stake);
      this.bank.escrow(b.accountId, stake);
      sendAccount(a.conn, this.bank, a.accountId);
      sendAccount(b.conn, this.bank, b.accountId);
    }
    this.createRoom([a, b], 'duel', stake, []);
    log.info('match_start', { a: a.accountId, b: b.accountId, stake });
  }

  private createRoom(
    sessions: Session[],
    mode: MatchMode,
    stake: number,
    bots: BotBinding[],
  ): void {
    const latencyOf = (connId: string): number =>
      sessions.find((s) => s.conn.id === connId)?.rtt ?? 0;

    // The onResult closure needs the ctx, which needs the room — break the cycle
    // with a stable holder (also keeps working across reconnects).
    const ref: { ctx?: RoomCtx } = {};
    const room = new Room(
      sessions.map((s) => s.conn),
      this.pickMap(),
      {
        targetKills: mode === 'ffa' ? this.opts.ffaTargetKills : this.opts.targetKills,
        respawnDelay: this.opts.respawnDelay,
        mode,
      },
      stake,
      latencyOf,
      (winner, scores) => {
        if (ref.ctx) this.settle(ref.ctx, winner, scores);
      },
    );
    const ctx: RoomCtx = { room, slots: sessions, mode, stake, bots: bots.map((b) => b.bot) };
    ref.ctx = ctx;
    for (const s of sessions) this.roomByConn.set(s.conn.id, ctx);
    // Bots drive their slot by routing inputs straight into the room (validated
    // like any client). Must be wired before start().
    for (const b of bots) b.bot.attach((msg) => room.handleMessage(b.conn, msg));
    room.start();
  }

  private settle(ctx: RoomCtx, winnerConnId: string | null, scores: Record<string, number>): void {
    if (ctx.graceTimer) clearTimeout(ctx.graceTimer);
    for (const b of ctx.bots) b.stop();
    for (const s of ctx.slots) {
      this.roomByConn.delete(s.conn.id);
      if (s.accountId) this.pausedByAccount.delete(s.accountId);
    }

    // Economy + stats only for 1v1 duels between two real accounts. FFA and bot
    // matches are free — no balance change, no stat farming.
    if (ctx.mode !== 'duel') return;
    const [a, b] = ctx.slots;
    if (!a?.accountId || !b?.accountId) return;

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
