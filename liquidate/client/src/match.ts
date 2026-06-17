/**
 * Networked match controller.
 *
 * - Self: client-side prediction with server reconciliation. Each fixed step we
 *   build an input, apply it locally with the SHARED stepMovement, send it, and
 *   keep it until the server acks it. On each snapshot we snap to the
 *   authoritative position and replay the still-unacked inputs.
 * - Opponent: entity interpolation (~100 ms behind), via the Opponent class.
 * - Firing is server-authoritative (ammo/hits/score from snapshots/events); the
 *   client only plays immediate muzzle/tracer cosmetics and hitmarkers.
 */

import {
  EYE_HEIGHT,
  MAX_HEALTH,
  RIFLE,
  aimDirection,
  nearestObstacle,
  stepMovement,
  type GameMap,
  type InputMessage,
  type ServerMessage,
  type StartMessage,
  type Vec3,
} from '@liquidate/shared';
import type { World } from './world';
import type { Input } from './input';
import type { Weapon } from './weapon';
import type { Hud } from './hud';
import type { Net } from './net';
import type { Opponent } from './opponent';

const STEP = 1 / 60; // fixed input/prediction step
const INTERP_MS = 100; // render the opponent this far in the past

export interface MatchResult {
  win: boolean;
  oppLeft: boolean;
  selfScore: number;
  oppScore: number;
}

export interface MatchCallbacks {
  onSearching: () => void;
  onPlaying: () => void;
  onOver: (result: MatchResult) => void;
  onSnapshot?: () => void;
}

export class Match {
  private selfId = '';
  private oppId = '';
  private spawnIndex: 0 | 1 = 0;

  private predicted: Vec3 = { x: 0, y: 0, z: 0 };
  private pending: InputMessage[] = [];
  private seq = 0;
  private acc = 0;

  private selfAlive = true;
  private selfAmmo = RIFLE.magazine;
  private selfReloading = false;
  private prevHealth = MAX_HEALTH;

  private selfScore = 0;
  private oppScore = 0;

  private lastSnapTime = 0;
  private lastSnapArrival = 0;

  private fireCooldown = 0;
  private playing = false;
  private over = false;
  private oppLeft = false;

  constructor(
    private readonly map: GameMap,
    private readonly world: World,
    private readonly input: Input,
    private readonly weapon: Weapon,
    private readonly hud: Hud,
    private readonly net: Net,
    private readonly opponent: Opponent,
    private readonly callbacks: MatchCallbacks,
  ) {
    this.net.onMessage = (m) => this.handle(m);
    this.input.onReload = () => this.net.send({ type: 'reload' });
  }

  /** Connect and enter matchmaking. */
  connect(): void {
    this.net.connect();
  }

  private handle(msg: ServerMessage): void {
    switch (msg.type) {
      case 'init':
        this.selfId = msg.id;
        break;
      case 'waiting':
        this.callbacks.onSearching();
        break;
      case 'start':
        this.begin(msg);
        break;
      case 'snap':
        this.onSnap(msg);
        break;
      case 'fire':
        if (msg.id === this.oppId) this.renderOpponentShot(msg.origin, msg.dir);
        break;
      case 'hit':
        if (msg.shooter === this.selfId) this.hud.hit(msg.headshot);
        if (msg.target === this.selfId) this.hud.damageFlash();
        break;
      case 'kill':
        this.onKill(msg.killer, msg.victim);
        break;
      case 'respawn':
        if (msg.id === this.selfId) this.onSelfRespawn(msg.x, msg.y, msg.z, msg.yaw);
        break;
      case 'oppLeft':
        this.oppLeft = true;
        break;
      case 'over':
        this.onOver(msg.winner);
        break;
      default:
        break;
    }
  }

  private begin(start: StartMessage): void {
    this.oppId = start.opponentId;
    this.spawnIndex = start.selfSpawnIndex;
    const spawn = this.map.spawns[this.spawnIndex];
    this.predicted = { ...spawn.pos };
    this.input.yaw = spawn.yaw;
    this.input.pitch = 0;
    this.pending = [];
    this.playing = true;
    this.syncCamera();
    this.hud.setScores(0, 0);
    this.hud.setHealth(MAX_HEALTH);
    this.hud.setAmmo(RIFLE.magazine, RIFLE.magazine);
    this.callbacks.onPlaying();
  }

  /** Called every render frame. */
  update(dt: number): void {
    if (!this.playing || this.over) return;

    // Fixed-step input sampling + prediction.
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.sampleInput(STEP);
      this.acc -= STEP;
      steps++;
    }

    // Firing (rate-limited locally; the server is authoritative on the result).
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.input.locked && this.input.firing) this.tryFire();

    this.syncCamera();

    // Opponent interpolation: render ~INTERP_MS behind the latest snapshot,
    // advanced smoothly by the local clock between snapshots.
    if (this.lastSnapTime > 0) {
      const renderTime = this.lastSnapTime + (performance.now() - this.lastSnapArrival) - INTERP_MS;
      this.opponent.update(renderTime);
    }

    this.weapon.update(dt);
    this.hud.setLatency(this.net.latency);
  }

  private sampleInput(step: number): void {
    const canMove = this.input.locked && this.selfAlive;
    const k = this.input.keys;
    const moveFwd = canMove ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0;
    const moveRight = canMove ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;

    this.seq++;
    const msg: InputMessage = {
      type: 'input',
      seq: this.seq,
      dt: step,
      moveFwd,
      moveRight,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
    };

    if (this.selfAlive) {
      this.predicted = stepMovement(
        this.predicted,
        { moveFwd, moveRight, yaw: this.input.yaw },
        step,
        this.map,
      );
    }
    this.pending.push(msg);
    this.net.send(msg);
  }

  private tryFire(): void {
    if (this.fireCooldown > 0 || this.selfReloading || this.selfAmmo <= 0 || !this.selfAlive)
      return;
    this.fireCooldown = RIFLE.fireInterval;
    this.net.send({ type: 'fire', seq: this.seq });

    // Immediate cosmetics (the server decides if it actually hit).
    const eye = this.eye();
    const dir = aimDirection(this.input.yaw, this.input.pitch);
    const dist = Math.min(nearestObstacle(eye, dir, this.map.obstacles), RIFLE.range, 80);
    this.weapon.fire({ x: eye.x + dir.x * dist, y: eye.y + dir.y * dist, z: eye.z + dir.z * dist });

    // Predict the ammo count down for a responsive HUD (snapshot will correct it).
    this.selfAmmo = Math.max(0, this.selfAmmo - 1);
    this.hud.setAmmo(this.selfAmmo, RIFLE.magazine);
  }

  private onSnap(msg: Extract<ServerMessage, { type: 'snap' }>): void {
    const self = msg.players.find((p) => p.id === this.selfId);
    const opp = msg.players.find((p) => p.id === this.oppId);

    if (self) {
      this.selfAlive = self.alive;
      this.selfAmmo = self.ammo;
      this.selfReloading = self.reloading;
      this.selfScore = self.score;

      // Reconcile: snap to authority, then replay unacked inputs.
      const acked = msg.ack[this.selfId] ?? 0;
      this.pending = this.pending.filter((i) => i.seq > acked);
      this.predicted = { x: self.x, y: self.y, z: self.z };
      if (self.alive) {
        for (const i of this.pending) {
          this.predicted = stepMovement(
            this.predicted,
            { moveFwd: i.moveFwd, moveRight: i.moveRight, yaw: i.yaw },
            i.dt,
            this.map,
          );
        }
      }

      this.hud.setAmmo(self.ammo, RIFLE.magazine);
      this.hud.setReloading(self.reloading);
      this.hud.setHealth(self.health);
      if (self.health < this.prevHealth) this.hud.damageFlash();
      this.prevHealth = self.health;
    }

    if (opp) {
      this.oppScore = opp.score;
      this.opponent.pushFrame(msg.serverTime, opp.x, opp.z, opp.yaw, opp.alive);
    }

    this.lastSnapTime = msg.serverTime;
    this.lastSnapArrival = performance.now();
    this.hud.setScores(this.selfScore, this.oppScore);
    this.callbacks.onSnapshot?.();
  }

  private renderOpponentShot(origin: Vec3, dir: Vec3): void {
    const dist = Math.min(nearestObstacle(origin, dir, this.map.obstacles), RIFLE.range, 80);
    this.weapon.spawnWorldTracer(origin, {
      x: origin.x + dir.x * dist,
      y: origin.y + dir.y * dist,
      z: origin.z + dir.z * dist,
    });
  }

  private onKill(killer: string, victim: string): void {
    if (victim === this.selfId) this.hud.banner('YOU DIED', 'bad');
    else if (killer === this.selfId) this.hud.banner('OPPONENT DOWN', 'good');
  }

  private onSelfRespawn(x: number, y: number, z: number, yaw: number): void {
    this.predicted = { x, y, z };
    this.pending = [];
    this.selfAlive = true;
    this.prevHealth = MAX_HEALTH;
    this.input.yaw = yaw;
    this.input.pitch = 0;
    this.syncCamera();
  }

  private onOver(winner: string): void {
    if (this.over) return;
    this.over = true;
    this.playing = false;
    this.callbacks.onOver({
      win: winner === this.selfId,
      oppLeft: this.oppLeft,
      selfScore: this.selfScore,
      oppScore: this.oppScore,
    });
  }

  private eye(): Vec3 {
    return { x: this.predicted.x, y: this.predicted.y + EYE_HEIGHT, z: this.predicted.z };
  }

  private syncCamera(): void {
    this.world.camera.position.set(
      this.predicted.x,
      this.predicted.y + EYE_HEIGHT,
      this.predicted.z,
    );
    this.world.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
  }
}
