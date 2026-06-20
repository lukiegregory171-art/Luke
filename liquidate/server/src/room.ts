/**
 * An authoritative 1v1 match. The room owns the truth: it integrates each
 * player's inputs with the SHARED movement code, resolves fires with the SHARED
 * occluded hitscan, tracks health/ammo/score, and broadcasts snapshots at the
 * fixed tick rate. Clients are never trusted for position, hits, or outcome.
 *
 * M6 hardening:
 *  - Lag compensation ("favor the shooter"): per-player position history is kept
 *    and a shot is resolved against where the target was at the shooter's view
 *    time (now - rtt/2 - interpolation), clamped to MAX_REWIND_MS.
 *  - Anti-cheat sanity checks: per-tick simulated-movement budget (bounds input
 *    flooding), view-angle clamping/validation, and the existing server-side
 *    fire-rate/ammo/reload + dt clamp. These reject impossible *inputs*. They do
 *    NOT and cannot detect aimbots — a bot that aims perfectly sends legal
 *    inputs. See `cheatFlags`.
 *  - Reconnection: a dropped player pauses the match for a grace period
 *    (orchestrated by the matchmaker) and can rebind to resume.
 */

import {
  DEFAULT_WEAPON,
  EYE_HEIGHT,
  INTERP_MS,
  MAX_HEALTH,
  MAX_REWIND_MS,
  MAX_TICK_DT,
  PITCH_LIMIT,
  TICK_DT,
  WEAPONS,
  WEAPON_SWITCH_TIME,
  freshMagazines,
  aimDirection,
  clamp,
  clampDt,
  hitscan,
  hurtboxes,
  makeMoveState,
  perturbDirection,
  rakeOf,
  sampleHistory,
  stepMovement,
  type ClientMessage,
  type GameMap,
  type HistorySample,
  type InputMessage,
  type MoveState,
  type OverMessage,
  type PlayerSnapshot,
  type Vec3,
  type WeaponId,
} from '@liquidate/shared';
import type { Connection } from './connection';
import { log } from './logger';

export interface RoomOptions {
  targetKills: number;
  respawnDelay: number;
}

const HISTORY_MS = 1000;

interface PlayerSim {
  conn: Connection;
  spawnIndex: 0 | 1;
  connected: boolean;
  move: MoveState;
  yaw: number;
  pitch: number;
  health: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reloading: boolean;
  reloadTimer: number;
  fireCooldown: number;
  alive: boolean;
  respawnTimer: number;
  score: number;
  lastProcessedSeq: number;
  queue: ClientMessage[];
  history: HistorySample[];
  cheatFlags: number; // count of rejected/clamped impossible inputs
}

function fullAmmo(): Record<WeaponId, number> {
  return freshMagazines();
}

export class Room {
  private readonly p0: PlayerSim;
  private readonly p1: PlayerSim;
  private interval?: ReturnType<typeof setInterval>;
  private tickCount = 0;
  private over = false;

  constructor(
    a: Connection,
    b: Connection,
    private readonly map: GameMap,
    private readonly opts: RoomOptions,
    private readonly stake: number,
    private readonly latencyOf: (connId: string) => number,
    private readonly onResult: (
      winnerConnId: string | null,
      scores: Record<string, number>,
    ) => void,
  ) {
    this.p0 = this.makePlayer(a, 0);
    this.p1 = this.makePlayer(b, 1);
  }

  private makePlayer(conn: Connection, spawnIndex: 0 | 1): PlayerSim {
    const spawn = this.map.spawns[spawnIndex];
    return {
      conn,
      spawnIndex,
      connected: true,
      move: makeMoveState(spawn.pos),
      yaw: spawn.yaw,
      pitch: 0,
      health: MAX_HEALTH,
      weapon: DEFAULT_WEAPON,
      ammo: fullAmmo(),
      reloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      alive: true,
      respawnTimer: 0,
      score: 0,
      lastProcessedSeq: 0,
      queue: [],
      history: [],
      cheatFlags: 0,
    };
  }

  start(): void {
    this.sendStart(this.p0);
    this.sendStart(this.p1);
    this.resume();
  }

  private sendStart(p: PlayerSim): void {
    p.conn.send({
      type: 'start',
      opponentId: this.opponentOf(p).conn.id,
      selfSpawnIndex: p.spawnIndex,
      map: this.map,
      stake: this.stake,
    });
  }

  /** Queue an in-match message from a player. */
  handleMessage(conn: Connection, msg: ClientMessage): void {
    if (this.over) return;
    const p = this.playerFor(conn);
    if (!p) return;
    if (
      msg.type === 'input' ||
      msg.type === 'fire' ||
      msg.type === 'reload' ||
      msg.type === 'switch'
    ) {
      p.queue.push(msg);
    }
  }

  // --- Reconnection (orchestrated by the matchmaker) ------------------------

  slotOf(connId: string): 0 | 1 | null {
    if (connId === this.p0.conn.id) return 0;
    if (connId === this.p1.conn.id) return 1;
    return null;
  }

  /** Pause the match because a player dropped (awaiting reconnect or forfeit). */
  markDisconnected(slot: 0 | 1): void {
    (slot === 0 ? this.p0 : this.p1).connected = false;
    this.pause();
    log.info('match_paused', { reason: 'disconnect', slot });
  }

  /** Rebind a reconnecting player to a fresh connection and resume. */
  rebind(slot: 0 | 1, conn: Connection): void {
    if (this.over) return;
    const p = slot === 0 ? this.p0 : this.p1;
    p.conn = conn;
    p.connected = true;
    p.queue.length = 0;
    this.sendStart(p);
    this.resume();
    log.info('match_resumed', { slot });
  }

  /** Forfeit: the given slot loses; the opponent wins. */
  forfeit(slot: 0 | 1): void {
    if (this.over) return;
    const loser = slot === 0 ? this.p0 : this.p1;
    const winner = this.opponentOf(loser);
    this.over = true;
    if (winner.conn.isOpen()) {
      winner.conn.send({ type: 'oppLeft' });
      winner.conn.send(this.overMessage(winner.conn.id));
    }
    log.info('match_forfeit', { winner: winner.conn.id, loser: loser.conn.id });
    this.cleanup(winner.conn.id);
  }

  private pause(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private resume(): void {
    if (this.over || this.interval) return;
    this.interval = setInterval(() => this.tick(), TICK_DT * 1000);
  }

  // --- Simulation -----------------------------------------------------------

  private tick(): void {
    if (this.over) return;
    const now = Date.now();
    for (const p of [this.p0, this.p1]) {
      this.advanceTimers(p, TICK_DT);
      this.drain(p);
      if (this.over) return; // a fire may have ended the match
    }
    this.recordHistory(now);
    this.tickCount++;
    this.broadcastSnapshot(now);
  }

  private recordHistory(now: number): void {
    for (const p of [this.p0, this.p1]) {
      p.history.push({ t: now, x: p.move.pos.x, z: p.move.pos.z });
      while (p.history.length > 1 && p.history[0].t < now - HISTORY_MS) p.history.shift();
    }
  }

  private advanceTimers(p: PlayerSim, dt: number): void {
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.reloading = false;
        p.ammo[p.weapon] = WEAPONS[p.weapon].magazine;
      }
    }
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawn(p);
    }
  }

  private drain(p: PlayerSim): void {
    // Anti-cheat: bound the total simulated movement time applied per tick so a
    // client cannot move faster by flooding inputs.
    let budget = MAX_TICK_DT;
    for (const msg of p.queue) {
      if (msg.type === 'input') {
        const want = clampDt(msg.dt);
        const allowed = Math.min(want, budget);
        this.applyInput(p, msg, allowed);
        if (allowed < want) p.cheatFlags++; // input-flood / oversized dt
        budget = Math.max(0, budget - allowed);
      } else if (msg.type === 'fire') {
        this.fire(p, this.opponentOf(p));
      } else if (msg.type === 'reload') {
        this.startReload(p);
      } else if (msg.type === 'switch') {
        this.switchWeapon(p, msg.weapon);
      }
      if (this.over) break;
    }
    p.queue.length = 0;
    if (p.cheatFlags > 0 && p.cheatFlags % 60 === 0) {
      log.warn('anticheat_flags', { conn: p.conn.id, flags: p.cheatFlags });
    }
  }

  private applyInput(p: PlayerSim, msg: InputMessage, dt: number): void {
    // View-angle validation (server-authoritative): finite yaw, clamped pitch.
    if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
    if (Number.isFinite(msg.pitch)) {
      const clamped = clamp(msg.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      if (clamped !== msg.pitch) p.cheatFlags++;
      p.pitch = clamped;
    }
    if (p.alive && dt > 0) {
      p.move = stepMovement(
        p.move,
        { moveFwd: msg.moveFwd, moveRight: msg.moveRight, yaw: p.yaw, dash: msg.dash },
        dt,
        this.map,
      );
    }
    p.lastProcessedSeq = msg.seq;
  }

  private switchWeapon(p: PlayerSim, weapon: WeaponId): void {
    if (!p.alive || p.weapon === weapon || !WEAPONS[weapon]) return;
    p.weapon = weapon;
    p.reloading = false;
    p.reloadTimer = 0;
    p.fireCooldown = Math.max(p.fireCooldown, WEAPON_SWITCH_TIME);
  }

  private fire(shooter: PlayerSim, target: PlayerSim): void {
    if (this.over || !shooter.alive || shooter.reloading || shooter.fireCooldown > 0) return;
    const w = WEAPONS[shooter.weapon];
    if (shooter.ammo[shooter.weapon] <= 0) {
      this.startReload(shooter);
      return;
    }

    shooter.ammo[shooter.weapon]--;
    shooter.fireCooldown = w.fireInterval;

    const eye: Vec3 = {
      x: shooter.move.pos.x,
      y: shooter.move.pos.y + EYE_HEIGHT,
      z: shooter.move.pos.z,
    };
    const dir = aimDirection(shooter.yaw, shooter.pitch);
    this.broadcast({ type: 'fire', id: shooter.conn.id, weapon: shooter.weapon, origin: eye, dir });

    if (target.alive) {
      // Lag compensation: resolve against where the target was on the shooter's
      // screen (now - rtt/2 - interpolation), clamped.
      const lag = clamp(this.latencyOf(shooter.conn.id) / 2 + INTERP_MS, 0, MAX_REWIND_MS);
      const past = sampleHistory(target.history, Date.now() - lag);
      const feet: Vec3 = past ? { x: past.x, y: 0, z: past.z } : target.move.pos;
      const box = hurtboxes(feet);

      let damage = 0;
      let headshot = false;
      for (let i = 0; i < w.pellets; i++) {
        const rayDir = perturbDirection(dir, w.spread);
        const hit = hitscan(eye, rayDir, w.range, box, this.map.obstacles);
        if (hit) {
          damage += w.damage * (hit.headshot ? w.headshotMultiplier : 1);
          if (hit.headshot) headshot = true;
        }
      }
      if (damage > 0) {
        damage = Math.round(damage);
        target.health -= damage;
        this.broadcast({
          type: 'hit',
          shooter: shooter.conn.id,
          target: target.conn.id,
          headshot,
          damage,
        });
        if (target.health <= 0) {
          target.health = 0;
          target.alive = false;
          target.respawnTimer = this.opts.respawnDelay;
          shooter.score++;
          this.broadcast({ type: 'kill', killer: shooter.conn.id, victim: target.conn.id });
          if (shooter.score >= this.opts.targetKills) {
            this.endMatch(shooter.conn.id);
            return;
          }
        }
      }
    }

    if (shooter.ammo[shooter.weapon] === 0) this.startReload(shooter);
  }

  private startReload(p: PlayerSim): void {
    const w = WEAPONS[p.weapon];
    if (p.reloading || p.ammo[p.weapon] === w.magazine || !p.alive) return;
    p.reloading = true;
    p.reloadTimer = w.reloadTime;
  }

  private respawn(p: PlayerSim): void {
    const spawn = this.map.spawns[p.spawnIndex];
    p.move = makeMoveState(spawn.pos);
    p.yaw = spawn.yaw;
    p.pitch = 0;
    p.health = MAX_HEALTH;
    p.weapon = DEFAULT_WEAPON;
    p.ammo = fullAmmo();
    p.reloading = false;
    p.reloadTimer = 0;
    p.fireCooldown = 0;
    p.alive = true;
    p.history.length = 0; // don't lag-comp across a teleport
    this.broadcast({
      type: 'respawn',
      id: p.conn.id,
      x: p.move.pos.x,
      y: p.move.pos.y,
      z: p.move.pos.z,
      yaw: p.yaw,
    });
  }

  private endMatch(winnerId: string): void {
    if (this.over) return;
    this.over = true;
    this.broadcast(this.overMessage(winnerId));
    log.info('match_over', { winner: winnerId, scores: this.scores() });
    this.cleanup(winnerId);
  }

  private overMessage(winnerId: string): OverMessage {
    const pot = this.stake * 2;
    return {
      type: 'over',
      winner: winnerId,
      scores: this.scores(),
      stake: this.stake,
      pot,
      rake: rakeOf(pot),
    };
  }

  private cleanup(winnerConnId: string | null): void {
    this.pause();
    this.onResult(winnerConnId, this.scores());
  }

  private broadcastSnapshot(now: number): void {
    const players: PlayerSnapshot[] = [this.snapshotOf(this.p0), this.snapshotOf(this.p1)];
    const ack: Record<string, number> = {
      [this.p0.conn.id]: this.p0.lastProcessedSeq,
      [this.p1.conn.id]: this.p1.lastProcessedSeq,
    };
    this.broadcast({ type: 'snap', tick: this.tickCount, serverTime: now, ack, players });
  }

  private snapshotOf(p: PlayerSim): PlayerSnapshot {
    return {
      id: p.conn.id,
      x: p.move.pos.x,
      y: p.move.pos.y,
      z: p.move.pos.z,
      vx: p.move.vel.x,
      vz: p.move.vel.z,
      dashCd: p.move.dashCd,
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      ammo: p.ammo[p.weapon],
      weapon: p.weapon,
      reloading: p.reloading,
      alive: p.alive,
      score: p.score,
    };
  }

  private scores(): Record<string, number> {
    return { [this.p0.conn.id]: this.p0.score, [this.p1.conn.id]: this.p1.score };
  }

  private broadcast(msg: Parameters<Connection['send']>[0]): void {
    if (this.p0.connected) this.p0.conn.send(msg);
    if (this.p1.connected) this.p1.conn.send(msg);
  }

  private playerFor(conn: Connection): PlayerSim | undefined {
    if (conn.id === this.p0.conn.id) return this.p0;
    if (conn.id === this.p1.conn.id) return this.p1;
    return undefined;
  }

  private opponentOf(p: PlayerSim): PlayerSim {
    return p === this.p0 ? this.p1 : this.p0;
  }
}
