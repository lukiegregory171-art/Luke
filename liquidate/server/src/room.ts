/**
 * An authoritative 1v1 match. The room owns the truth: it integrates each
 * player's inputs with the SHARED movement code, resolves fires with the SHARED
 * occluded hitscan, tracks health/ammo/score, and broadcasts snapshots at the
 * fixed tick rate. Clients are never trusted for position, hits, or outcome.
 */

import {
  EYE_HEIGHT,
  MAX_HEALTH,
  RIFLE,
  TICK_DT,
  aimDirection,
  hitscan,
  hurtboxes,
  stepMovement,
  type ClientMessage,
  type GameMap,
  type InputMessage,
  type PlayerSnapshot,
  type Vec3,
} from '@liquidate/shared';
import type { Connection } from './connection';

export interface RoomOptions {
  targetKills: number;
  respawnDelay: number;
}

interface PlayerSim {
  conn: Connection;
  spawnIndex: 0 | 1;
  feet: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  ammo: number;
  reloading: boolean;
  reloadTimer: number;
  fireCooldown: number;
  alive: boolean;
  respawnTimer: number;
  score: number;
  lastProcessedSeq: number;
  queue: ClientMessage[];
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
    private readonly onEnd: () => void,
  ) {
    this.p0 = this.makePlayer(a, 0);
    this.p1 = this.makePlayer(b, 1);
  }

  private makePlayer(conn: Connection, spawnIndex: 0 | 1): PlayerSim {
    const spawn = this.map.spawns[spawnIndex];
    return {
      conn,
      spawnIndex,
      feet: { ...spawn.pos },
      yaw: spawn.yaw,
      pitch: 0,
      health: MAX_HEALTH,
      ammo: RIFLE.magazine,
      reloading: false,
      reloadTimer: 0,
      fireCooldown: 0,
      alive: true,
      respawnTimer: 0,
      score: 0,
      lastProcessedSeq: 0,
      queue: [],
    };
  }

  start(): void {
    this.p0.conn.send({ type: 'start', opponentId: this.p1.conn.id, selfSpawnIndex: 0 });
    this.p1.conn.send({ type: 'start', opponentId: this.p0.conn.id, selfSpawnIndex: 1 });
    this.interval = setInterval(() => this.tick(), TICK_DT * 1000);
  }

  /** Queue an in-match message (input/fire/reload) from a player. */
  handleMessage(conn: Connection, msg: ClientMessage): void {
    if (this.over) return;
    const p = this.playerFor(conn);
    if (!p) return;
    if (msg.type === 'input' || msg.type === 'fire' || msg.type === 'reload') {
      p.queue.push(msg);
    }
  }

  /** A player dropped: the opponent wins by forfeit. */
  handleDisconnect(conn: Connection): void {
    if (this.over) return;
    const leaver = this.playerFor(conn);
    if (!leaver) return;
    const opp = this.opponentOf(leaver);
    this.over = true;
    if (opp.conn.isOpen()) {
      opp.conn.send({ type: 'oppLeft' });
      opp.conn.send({ type: 'over', winner: opp.conn.id, scores: this.scores() });
    }
    this.cleanup();
  }

  private tick(): void {
    if (this.over) return;
    for (const p of [this.p0, this.p1]) {
      this.advanceTimers(p, TICK_DT);
      this.drain(p);
      if (this.over) return; // a fire may have ended the match
    }
    this.tickCount++;
    this.broadcastSnapshot();
  }

  private advanceTimers(p: PlayerSim, dt: number): void {
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        p.reloading = false;
        p.ammo = RIFLE.magazine;
      }
    }
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) this.respawn(p);
    }
  }

  private drain(p: PlayerSim): void {
    for (const msg of p.queue) {
      if (msg.type === 'input') this.applyInput(p, msg);
      else if (msg.type === 'fire') this.fire(p, this.opponentOf(p));
      else if (msg.type === 'reload') this.startReload(p);
      if (this.over) break;
    }
    p.queue.length = 0;
  }

  private applyInput(p: PlayerSim, msg: InputMessage): void {
    p.yaw = msg.yaw;
    p.pitch = msg.pitch;
    if (p.alive) {
      p.feet = stepMovement(
        p.feet,
        { moveFwd: msg.moveFwd, moveRight: msg.moveRight, yaw: msg.yaw },
        msg.dt,
        this.map,
      );
    }
    // LIMITATION: the server processes every queued input, but does not yet bound
    // how many a client may submit per tick. A client that floods inputs could
    // move faster than intended (an input-count speed-hack). The per-input dt is
    // clamped (MAX_DT), but the per-tick count is not — addressed in M6's
    // anti-cheat sanity checks.
    p.lastProcessedSeq = msg.seq;
  }

  private fire(shooter: PlayerSim, target: PlayerSim): void {
    if (this.over || !shooter.alive || shooter.reloading || shooter.fireCooldown > 0) return;
    if (shooter.ammo <= 0) {
      this.startReload(shooter);
      return;
    }

    shooter.ammo--;
    shooter.fireCooldown = RIFLE.fireInterval;

    const eye: Vec3 = { x: shooter.feet.x, y: shooter.feet.y + EYE_HEIGHT, z: shooter.feet.z };
    const dir = aimDirection(shooter.yaw, shooter.pitch);
    this.broadcast({ type: 'fire', id: shooter.conn.id, origin: eye, dir });

    if (target.alive) {
      const hit = hitscan(eye, dir, RIFLE.range, hurtboxes(target.feet), this.map.obstacles);
      if (hit) {
        const damage = Math.round(RIFLE.damage * (hit.headshot ? RIFLE.headshotMultiplier : 1));
        target.health -= damage;
        this.broadcast({
          type: 'hit',
          shooter: shooter.conn.id,
          target: target.conn.id,
          headshot: hit.headshot,
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

    if (shooter.ammo === 0) this.startReload(shooter);
  }

  private startReload(p: PlayerSim): void {
    if (p.reloading || p.ammo === RIFLE.magazine || !p.alive) return;
    p.reloading = true;
    p.reloadTimer = RIFLE.reloadTime;
  }

  private respawn(p: PlayerSim): void {
    const spawn = this.map.spawns[p.spawnIndex];
    p.feet = { ...spawn.pos };
    p.yaw = spawn.yaw;
    p.pitch = 0;
    p.health = MAX_HEALTH;
    p.ammo = RIFLE.magazine;
    p.reloading = false;
    p.reloadTimer = 0;
    p.fireCooldown = 0;
    p.alive = true;
    this.broadcast({
      type: 'respawn',
      id: p.conn.id,
      x: p.feet.x,
      y: p.feet.y,
      z: p.feet.z,
      yaw: p.yaw,
    });
  }

  private endMatch(winnerId: string): void {
    if (this.over) return;
    this.over = true;
    this.broadcast({ type: 'over', winner: winnerId, scores: this.scores() });
    this.cleanup();
  }

  private cleanup(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    this.onEnd();
  }

  private broadcastSnapshot(): void {
    const players: PlayerSnapshot[] = [this.snapshotOf(this.p0), this.snapshotOf(this.p1)];
    const ack: Record<string, number> = {
      [this.p0.conn.id]: this.p0.lastProcessedSeq,
      [this.p1.conn.id]: this.p1.lastProcessedSeq,
    };
    const msg = {
      type: 'snap' as const,
      tick: this.tickCount,
      serverTime: Date.now(),
      ack,
      players,
    };
    this.broadcast(msg);
  }

  private snapshotOf(p: PlayerSim): PlayerSnapshot {
    return {
      id: p.conn.id,
      x: p.feet.x,
      y: p.feet.y,
      z: p.feet.z,
      yaw: p.yaw,
      pitch: p.pitch,
      health: p.health,
      ammo: p.ammo,
      reloading: p.reloading,
      alive: p.alive,
      score: p.score,
    };
  }

  private scores(): Record<string, number> {
    return { [this.p0.conn.id]: this.p0.score, [this.p1.conn.id]: this.p1.score };
  }

  private broadcast(msg: Parameters<Connection['send']>[0]): void {
    this.p0.conn.send(msg);
    this.p1.conn.send(msg);
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
