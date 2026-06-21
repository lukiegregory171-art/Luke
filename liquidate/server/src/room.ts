/**
 * An authoritative match for N players (1v1 duel = 2, FFA = up to 6). The room
 * owns the truth: it integrates each player's inputs with the SHARED movement
 * code, resolves fires with the SHARED occluded hitscan against ALL other
 * players (nearest hit wins, so players occlude each other), tracks
 * health/ammo/score, and broadcasts snapshots at the fixed tick rate. Clients
 * are never trusted for position, hits, or outcome.
 *
 *  - Lag compensation ("favor the shooter"): per-player position history; a shot
 *    is resolved against where each target was at the shooter's view time
 *    (now - rtt/2 - interpolation), clamped to MAX_REWIND_MS.
 *  - Anti-cheat: per-tick simulated-movement budget, view-angle clamp/validate,
 *    server-side fire-rate/ammo/reload + dt clamp. Rejects impossible *inputs*;
 *    cannot detect aimbots.
 *  - Duel reconnection: a dropped player pauses the match for a grace period
 *    (orchestrated by the matchmaker) and can rebind. FFA does not pause — a
 *    leaver is simply removed and the match continues.
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
  type MatchMode,
  type MoveState,
  type OverMessage,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec3,
  type WeaponId,
} from '@liquidate/shared';
import type { Connection } from './connection';
import { log } from './logger';

export interface RoomOptions {
  targetKills: number;
  respawnDelay: number;
  mode: MatchMode;
}

const HISTORY_MS = 1000;

interface PlayerSim {
  conn: Connection;
  name: string;
  team: number;
  spawnIndex: number;
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
  cheatFlags: number;
}

function fullAmmo(): Record<WeaponId, number> {
  return freshMagazines();
}

export class Room {
  private readonly players: PlayerSim[];
  private readonly mode: MatchMode;
  private readonly teamScores = [0, 0]; // TDM: frags per team
  private interval?: ReturnType<typeof setInterval>;
  private tickCount = 0;
  private over = false;

  constructor(
    conns: Connection[],
    names: string[],
    teams: number[],
    private readonly map: GameMap,
    private readonly opts: RoomOptions,
    private readonly stake: number,
    private readonly latencyOf: (connId: string) => number,
    private readonly onResult: (
      winnerConnId: string | null,
      scores: Record<string, number>,
    ) => void,
  ) {
    this.mode = opts.mode;
    this.players = conns.map((c, i) => this.makePlayer(c, names[i] ?? c.id, teams[i] ?? 0, i));
  }

  private makePlayer(conn: Connection, name: string, team: number, spawnIndex: number): PlayerSim {
    const spawn = this.map.spawns[spawnIndex % this.map.spawns.length];
    return {
      conn,
      name,
      team,
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
    for (const p of this.players) this.sendStart(p);
    this.resume();
  }

  private sendStart(p: PlayerSim): void {
    const others = this.players.filter((o) => o !== p);
    const names: Record<string, string> = {};
    const teams: Record<string, number> = {};
    for (const o of this.players) {
      names[o.conn.id] = o.name;
      teams[o.conn.id] = o.team;
    }
    p.conn.send({
      type: 'start',
      mode: this.mode,
      opponentId: this.mode === 'duel' && others[0] ? others[0].conn.id : '',
      players: this.players.map((o) => o.conn.id),
      names,
      teams,
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

  // --- Reconnection / leaving (orchestrated by the matchmaker) --------------

  slotOf(connId: string): number | null {
    const i = this.players.findIndex((p) => p.conn.id === connId);
    return i >= 0 ? i : null;
  }

  /** Count of still-connected players (used by the matchmaker for FFA). */
  connectedCount(): number {
    return this.players.filter((p) => p.connected).length;
  }

  /** Duel: pause because a player dropped (awaiting reconnect or forfeit). */
  markDisconnected(slot: number): void {
    const p = this.players[slot];
    if (p) p.connected = false;
    this.pause();
    log.info('match_paused', { reason: 'disconnect', slot });
  }

  /** Duel: rebind a reconnecting player to a fresh connection and resume. */
  rebind(slot: number, conn: Connection): void {
    if (this.over) return;
    const p = this.players[slot];
    if (!p) return;
    p.conn = conn;
    p.connected = true;
    p.queue.length = 0;
    this.sendStart(p);
    this.resume();
    log.info('match_resumed', { slot });
  }

  /** Duel forfeit: the given slot loses; the (single) opponent wins. */
  forfeit(slot: number): void {
    if (this.over) return;
    const loser = this.players[slot];
    const winner = this.players.find((p) => p !== loser);
    if (!winner) {
      this.endNoContest();
      return;
    }
    this.over = true;
    if (winner.conn.isOpen()) {
      winner.conn.send({ type: 'oppLeft' });
      winner.conn.send(this.overMessage(winner.conn.id));
    }
    log.info('match_forfeit', { winner: winner.conn.id, loser: loser.conn.id });
    this.cleanup(winner.conn.id);
  }

  /** FFA: a player left for good — remove them; the match continues for others. */
  leave(slot: number): void {
    if (this.over) return;
    const p = this.players[slot];
    if (!p) return;
    p.connected = false;
    p.alive = false;
    p.queue.length = 0;
    log.info('ffa_leave', { slot });
  }

  /** End with no winner (e.g. everyone left an FFA match). */
  endNoContest(): void {
    if (this.over) return;
    this.over = true;
    this.cleanup(null);
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
    for (const p of this.players) {
      this.advanceTimers(p, TICK_DT);
      this.drain(p);
      if (this.over) return; // a fire may have ended the match
    }
    this.recordHistory(now);
    this.tickCount++;
    this.broadcastSnapshot(now);
  }

  private recordHistory(now: number): void {
    for (const p of this.players) {
      p.history.push({ t: now, x: p.move.pos.x, y: p.move.pos.y, z: p.move.pos.z });
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
    if (!p.alive && p.connected) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawn(p);
    }
  }

  private drain(p: PlayerSim): void {
    if (!p.connected) {
      p.queue.length = 0;
      return;
    }
    // Anti-cheat: bound total simulated movement time applied per tick.
    let budget = MAX_TICK_DT;
    for (const msg of p.queue) {
      if (msg.type === 'input') {
        const want = clampDt(msg.dt);
        const allowed = Math.min(want, budget);
        this.applyInput(p, msg, allowed);
        if (allowed < want) p.cheatFlags++;
        budget = Math.max(0, budget - allowed);
      } else if (msg.type === 'fire') {
        this.fire(p);
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
    if (Number.isFinite(msg.yaw)) p.yaw = msg.yaw;
    if (Number.isFinite(msg.pitch)) {
      const clamped = clamp(msg.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      if (clamped !== msg.pitch) p.cheatFlags++;
      p.pitch = clamped;
    }
    if (p.alive && dt > 0) {
      p.move = stepMovement(
        p.move,
        { moveFwd: msg.moveFwd, moveRight: msg.moveRight, yaw: p.yaw, dash: msg.dash, jump: msg.jump },
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

  /** Resolve a shot from `shooter` against ALL other players (nearest hit). */
  private fire(shooter: PlayerSim): void {
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

    // Lag-comp box per target (where it was on the shooter's screen). In TDM,
    // friendly fire is OFF — teammates are not valid targets.
    const lag = clamp(this.latencyOf(shooter.conn.id) / 2 + INTERP_MS, 0, MAX_REWIND_MS);
    const viewTime = Date.now() - lag;
    const targets = this.players.filter(
      (t) =>
        t !== shooter &&
        t.alive &&
        t.connected &&
        !(this.mode === 'tdm' && t.team === shooter.team),
    );

    const tally = new Map<PlayerSim, { dmg: number; head: boolean }>();
    for (let i = 0; i < w.pellets; i++) {
      const rayDir = perturbDirection(dir, w.spread);
      let best: { target: PlayerSim; t: number; head: boolean } | null = null;
      for (const target of targets) {
        const past = sampleHistory(target.history, viewTime);
        const feet: Vec3 = past ? { x: past.x, y: past.y, z: past.z } : target.move.pos;
        const hit = hitscan(eye, rayDir, w.range, hurtboxes(feet), this.map.obstacles);
        if (hit && (!best || hit.t < best.t)) best = { target, t: hit.t, head: hit.headshot };
      }
      if (best) {
        const d = w.damage * (best.head ? w.headshotMultiplier : 1);
        const cur = tally.get(best.target) ?? { dmg: 0, head: false };
        cur.dmg += d;
        cur.head = cur.head || best.head;
        tally.set(best.target, cur);
      }
    }

    for (const [target, { dmg, head }] of tally) {
      const damage = Math.round(dmg);
      target.health -= damage;
      this.broadcast({
        type: 'hit',
        shooter: shooter.conn.id,
        target: target.conn.id,
        headshot: head,
        damage,
      });
      if (target.health <= 0) {
        target.health = 0;
        target.alive = false;
        target.respawnTimer = this.opts.respawnDelay;
        shooter.score++;
        this.broadcast({ type: 'kill', killer: shooter.conn.id, victim: target.conn.id });
        if (this.mode === 'tdm') {
          this.teamScores[shooter.team] = (this.teamScores[shooter.team] ?? 0) + 1;
          if (this.teamScores[shooter.team] >= this.opts.targetKills) {
            this.endMatch(null, shooter.team);
            return;
          }
        } else if (shooter.score >= this.opts.targetKills) {
          this.endMatch(shooter.conn.id);
          return;
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
    const spawn = this.pickRespawn(p);
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

  /**
   * Duel: own spawn. FFA: farthest from any live player. TDM: farthest from live
   * ENEMIES (so you don't spawn in the enemy's lap, but can group with allies).
   */
  private pickRespawn(p: PlayerSim): { pos: Vec3; yaw: number } {
    if (this.mode === 'duel') return this.map.spawns[p.spawnIndex % this.map.spawns.length];
    const enemies = this.players.filter(
      (o) => o !== p && o.alive && o.connected && !(this.mode === 'tdm' && o.team === p.team),
    );
    let best = this.map.spawns[p.spawnIndex % this.map.spawns.length];
    let bestDist = -1;
    for (const s of this.map.spawns) {
      let minD = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(s.pos.x - e.move.pos.x, s.pos.z - e.move.pos.z);
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        best = s;
      }
    }
    return best;
  }

  private endMatch(winnerId: string | null, winnerTeam?: number): void {
    if (this.over) return;
    this.over = true;
    this.broadcast(this.overMessage(winnerId, winnerTeam));
    log.info('match_over', { winner: winnerId, winnerTeam, scores: this.scores() });
    this.cleanup(winnerId);
  }

  private overMessage(winnerId: string | null, winnerTeam?: number): OverMessage {
    const pot = this.stake * 2;
    return {
      type: 'over',
      winner: winnerId ?? '',
      winnerTeam,
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
    const players: PlayerSnapshot[] = this.players.map((p) => this.snapshotOf(p));
    const ack: Record<string, number> = {};
    for (const p of this.players) ack[p.conn.id] = p.lastProcessedSeq;
    this.broadcast({ type: 'snap', tick: this.tickCount, serverTime: now, ack, players });
  }

  private snapshotOf(p: PlayerSim): PlayerSnapshot {
    return {
      id: p.conn.id,
      x: p.move.pos.x,
      y: p.move.pos.y,
      z: p.move.pos.z,
      vx: p.move.vel.x,
      vy: p.move.vel.y,
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
    const s: Record<string, number> = {};
    for (const p of this.players) s[p.conn.id] = p.score;
    return s;
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of this.players) if (p.connected) p.conn.send(msg);
  }

  private playerFor(conn: Connection): PlayerSim | undefined {
    return this.players.find((p) => p.conn.id === conn.id);
  }
}
