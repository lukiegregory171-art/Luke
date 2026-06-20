/**
 * Networked match controller.
 *
 * - Self: client-side prediction with server reconciliation. Each fixed step we
 *   build an input, apply it locally with the SHARED stepMovement, send it, and
 *   keep it until the server acks it. On each snapshot we snap to the
 *   authoritative movement state (pos + velocity + dash cooldown) and replay the
 *   still-unacked inputs.
 * - Opponent: entity interpolation (~100 ms behind), via the Opponent class.
 * - Firing is server-authoritative (ammo/hits/score from snapshots/events); the
 *   client only plays immediate muzzle/tracer cosmetics and hitmarkers.
 */

import {
  DEFAULT_WEAPON,
  EYE_HEIGHT,
  MAX_HEALTH,
  WEAPONS,
  aimDirection,
  forwardFromYaw,
  makeMoveState,
  nearestObstacle,
  perturbDirection,
  rightFromYaw,
  stepMovement,
  type GameMap,
  type InputMessage,
  type MatchMode,
  type MoveState,
  type ServerMessage,
  type StartMessage,
  type Vec3,
  type WeaponId,
} from '@liquidate/shared';
import type { World } from './world';
import type { Input } from './input';
import type { Weapon } from './weapon';
import type { Hud, ScoreRow } from './hud';
import type { Net } from './net';
import type { Opponents } from './opponents';
import type { Sfx } from './audio';
import type { Impacts } from './impacts';
import type { Shake } from './shake';

const STEP = 1 / 60; // fixed input/prediction step
const INTERP_MS = 100; // render the opponent this far in the past

export interface MatchResult {
  win: boolean;
  oppLeft: boolean;
  mode: MatchMode;
  selfScore: number;
  oppScore: number;
  board: ScoreRow[]; // final standings, sorted by frags desc
  place: number; // self's 1-based rank
  stake: number;
  pot: number;
  rake: number;
  net: number; // player's net DEMO change for the match
}

export interface MatchCallbacks {
  onSearching: () => void;
  onPlaying: () => void;
  onOver: (result: MatchResult) => void;
  onSnapshot?: () => void;
}

const SLOT: Record<WeaponId, number> = { assault: 1, smg: 2, sniper: 3 };

export class Match {
  private selfId = '';
  private mode: MatchMode = 'duel';
  private spawnIndex = 0;

  private predicted: MoveState = makeMoveState({ x: 0, y: 0, z: 0 });
  private pending: InputMessage[] = [];
  private seq = 0;
  private acc = 0;

  private selfAlive = true;
  private selfAmmo = WEAPONS[DEFAULT_WEAPON].magazine;
  private selfReloading = false;
  private selfWeapon: WeaponId = DEFAULT_WEAPON;
  private prevHealth = MAX_HEALTH;

  private selfScore = 0;
  private oppScore = 0; // leader among the other players (for the scoreboard/result)
  private lastHeadshot = false;
  private names: Record<string, string> = {};
  private snapPlayers: { id: string; score: number; alive: boolean }[] = [];

  private lastSnapTime = 0;
  private lastSnapArrival = 0;

  private fireCooldown = 0;
  private playing = false;
  private over = false;
  private oppLeft = false;

  constructor(
    selfId: string,
    private map: GameMap,
    private readonly world: World,
    private readonly input: Input,
    private readonly weapon: Weapon,
    private readonly hud: Hud,
    private readonly net: Net,
    private readonly opponents: Opponents,
    private readonly sfx: Sfx,
    private readonly impacts: Impacts,
    private readonly shake: Shake,
    private readonly callbacks: MatchCallbacks,
  ) {
    this.selfId = selfId;
    this.input.onReload = () => {
      this.net.send({ type: 'reload' });
      this.sfx.reload();
    };
    this.input.onSwitch = (w) => this.net.send({ type: 'switch', weapon: w });
  }

  /** Dispatch a server message (called by the app for game-related messages). */
  handle(msg: ServerMessage): void {
    switch (msg.type) {
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
        if (msg.id !== this.selfId) this.renderOpponentShot(msg.weapon, msg.origin, msg.dir);
        break;
      case 'hit':
        this.onHit(msg.shooter, msg.target, msg.headshot);
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
        this.onOver(msg);
        break;
      default:
        break;
    }
  }

  private begin(start: StartMessage): void {
    this.map = start.map;
    this.mode = start.mode;
    this.names = start.names;
    this.snapPlayers = [];
    this.world.setMap(this.map);
    this.spawnIndex = start.selfSpawnIndex;
    const spawn = this.map.spawns[this.spawnIndex];
    this.predicted = makeMoveState(spawn.pos);
    this.input.yaw = spawn.yaw;
    this.input.pitch = 0;
    this.pending = [];
    this.selfWeapon = DEFAULT_WEAPON;
    this.selfScore = 0;
    this.oppScore = 0;
    this.opponents.reset();
    this.over = false;
    this.oppLeft = false;
    this.playing = true;
    this.syncCamera();
    this.updateScoreboard();
    this.hud.setHealth(MAX_HEALTH);
    const w0 = WEAPONS[DEFAULT_WEAPON];
    this.hud.setAmmo(w0.magazine, w0.magazine);
    this.hud.setWeapon(w0.name, SLOT[DEFAULT_WEAPON]);
    this.weapon.setWeapon(DEFAULT_WEAPON);
    this.callbacks.onPlaying();
  }

  update(dt: number): void {
    if (!this.playing || this.over) return;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.sampleInput(STEP);
      this.acc -= STEP;
      steps++;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.input.locked && this.input.firing) this.tryFire();

    this.syncCamera();

    if (this.lastSnapTime > 0) {
      const renderTime = this.lastSnapTime + (performance.now() - this.lastSnapArrival) - INTERP_MS;
      this.opponents.update(renderTime, dt);
    }

    const selfSpeed = Math.hypot(this.predicted.vel.x, this.predicted.vel.z);
    this.weapon.update(dt, { speed: selfSpeed, yaw: this.input.yaw, pitch: this.input.pitch });
    if (this.selfAlive && this.input.locked) this.sfx.footsteps(dt, selfSpeed);
    this.hud.setLatency(this.net.latency);
    // Live scoreboard while Tab is held.
    this.hud.showScoreboard(
      this.input.scoreboard && this.snapPlayers.length ? this.rows(this.snapPlayers) : null,
    );
  }

  private sampleInput(step: number): void {
    const canAct = this.input.locked && this.selfAlive;
    const k = this.input.keys;
    const moveFwd = canAct ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0;
    const moveRight = canAct ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    const dash = canAct && this.input.consumeDash();
    if (dash) this.sfx.dash();

    this.seq++;
    const msg: InputMessage = {
      type: 'input',
      seq: this.seq,
      dt: step,
      moveFwd,
      moveRight,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      dash,
    };

    if (this.selfAlive) {
      this.predicted = stepMovement(
        this.predicted,
        { moveFwd, moveRight, yaw: this.input.yaw, dash },
        step,
        this.map,
      );
    }
    this.pending.push(msg);
    this.net.send(msg);
  }

  private tryFire(): void {
    const w = WEAPONS[this.selfWeapon];
    if (this.fireCooldown > 0 || this.selfReloading || this.selfAmmo <= 0 || !this.selfAlive)
      return;
    this.fireCooldown = w.fireInterval;
    this.net.send({ type: 'fire', seq: this.seq });

    const eye = this.eye();
    const dir = aimDirection(this.input.yaw, this.input.pitch);
    if (w.pellets > 1) {
      const ends: Vec3[] = [];
      for (let i = 0; i < w.pellets; i++)
        ends.push(this.endpoint(eye, perturbDirection(dir, w.spread), w.range));
      this.weapon.fireMany(ends);
      for (const e of ends) this.impacts.spawn(e, 'surface');
    } else {
      const end = this.endpoint(eye, dir, w.range);
      this.weapon.fire(end);
      this.impacts.spawn(end, 'surface');
    }
    this.sfx.shoot(this.selfWeapon);
    this.shake.add(w.pellets > 1 ? 0.28 : 0.16);
    this.hud.crosshairKick();

    this.selfAmmo = Math.max(0, this.selfAmmo - 1);
    this.hud.setAmmo(this.selfAmmo, w.magazine);
  }

  private endpoint(eye: Vec3, dir: Vec3, range: number): Vec3 {
    const dist = Math.min(nearestObstacle(eye, dir, this.map.obstacles), range, 80);
    return { x: eye.x + dir.x * dist, y: eye.y + dir.y * dist, z: eye.z + dir.z * dist };
  }

  private onSnap(msg: Extract<ServerMessage, { type: 'snap' }>): void {
    const self = msg.players.find((p) => p.id === this.selfId);

    if (self) {
      this.selfAlive = self.alive;
      this.selfAmmo = self.ammo;
      this.selfReloading = self.reloading;
      this.selfScore = self.score;

      const acked = msg.ack[this.selfId] ?? 0;
      this.pending = this.pending.filter((i) => i.seq > acked);
      this.predicted = {
        pos: { x: self.x, y: self.y, z: self.z },
        vel: { x: self.vx, y: 0, z: self.vz },
        dashCd: self.dashCd,
      };
      if (self.alive) {
        for (const i of this.pending) {
          this.predicted = stepMovement(
            this.predicted,
            { moveFwd: i.moveFwd, moveRight: i.moveRight, yaw: i.yaw, dash: i.dash },
            i.dt,
            this.map,
          );
        }
      }

      if (self.weapon !== this.selfWeapon) {
        this.selfWeapon = self.weapon;
        this.weapon.setWeapon(self.weapon);
        this.hud.setWeapon(WEAPONS[self.weapon].name, SLOT[self.weapon]);
      }
      this.hud.setAmmo(self.ammo, WEAPONS[self.weapon].magazine);
      this.hud.setReloading(self.reloading);
      this.hud.setHealth(self.health);
      if (self.health < this.prevHealth) this.hud.damageFlash();
      this.prevHealth = self.health;
    }

    // Every other player is a remote opponent: buffer it for interpolation, and
    // track the leading score among them.
    const present = new Set<string>();
    let leader = 0;
    for (const p of msg.players) {
      if (p.id === this.selfId) continue;
      present.add(p.id);
      this.opponents.pushFrame(p.id, msg.serverTime, p.x, p.z, p.yaw, p.alive);
      if (p.score > leader) leader = p.score;
    }
    this.opponents.retainOnly(present);
    this.oppScore = leader;
    this.snapPlayers = msg.players.map((p) => ({ id: p.id, score: p.score, alive: p.alive }));

    this.lastSnapTime = msg.serverTime;
    this.lastSnapArrival = performance.now();
    this.updateScoreboard();
    this.callbacks.onSnapshot?.();
  }

  private updateScoreboard(): void {
    if (this.mode === 'ffa') this.hud.setFrags(this.selfScore, this.oppScore);
    else this.hud.setScores(this.selfScore, this.oppScore);
  }

  /** Build sorted scoreboard rows from {id,score,alive} entries. */
  private rows(entries: { id: string; score: number; alive: boolean }[]): ScoreRow[] {
    return entries
      .map((e) => ({
        name: this.names[e.id] ?? 'Player',
        frags: e.score,
        self: e.id === this.selfId,
        alive: e.alive,
      }))
      .sort((a, b) => b.frags - a.frags);
  }

  private renderOpponentShot(weapon: WeaponId, origin: Vec3, dir: Vec3): void {
    const w = WEAPONS[weapon];
    if (w.pellets > 1) {
      for (let i = 0; i < w.pellets; i++) {
        const end = this.endpoint(origin, perturbDirection(dir, w.spread), w.range);
        this.weapon.spawnWorldTracer(origin, end);
        this.impacts.spawn(end, 'surface');
      }
    } else {
      const end = this.endpoint(origin, dir, w.range);
      this.weapon.spawnWorldTracer(origin, end);
      this.impacts.spawn(end, 'surface');
    }
    this.sfx.shoot(weapon);
  }

  private onHit(shooter: string, target: string, headshot: boolean): void {
    this.lastHeadshot = headshot;
    if (shooter === this.selfId) {
      this.hud.hit(headshot);
      this.sfx.hit(headshot);
      // Floating damage number (computed from weapon data; the hit itself is
      // server-decided). Blood spark at the hit player's torso.
      const w = WEAPONS[this.selfWeapon];
      this.hud.damageNumber(Math.round(w.damage * (headshot ? w.headshotMultiplier : 1)), headshot);
      const p = this.opponents.positionOf(target);
      if (p) this.impacts.spawn({ x: p.x, y: 1.1, z: p.z }, 'flesh');
    }
    if (target === this.selfId) {
      this.hud.damageFlash();
      const from = this.opponents.positionOf(shooter);
      if (from) this.hud.damageFrom(this.bearingTo({ x: from.x, y: 0, z: from.z }));
      this.shake.add(headshot ? 0.5 : 0.38);
    }
  }

  private onKill(killer: string, victim: string): void {
    const label = (id: string): string => (id === this.selfId ? 'YOU' : 'OPP');
    this.hud.addKill(label(killer), label(victim), this.lastHeadshot);
    if (victim === this.selfId) {
      this.hud.banner('YOU DIED', 'bad');
      this.sfx.death();
    } else if (killer === this.selfId) {
      this.hud.banner(this.mode === 'ffa' ? 'FRAG' : 'OPPONENT DOWN', 'good');
      this.sfx.kill();
    }
  }

  private onSelfRespawn(x: number, y: number, z: number, yaw: number): void {
    this.predicted = makeMoveState({ x, y, z });
    this.pending = [];
    this.selfAlive = true;
    this.prevHealth = MAX_HEALTH;
    this.input.yaw = yaw;
    this.input.pitch = 0;
    this.syncCamera();
  }

  private onOver(over: Extract<ServerMessage, { type: 'over' }>): void {
    if (this.over) return;
    this.over = true;
    this.playing = false;
    this.hud.showScoreboard(null);
    const win = over.winner === this.selfId;
    const board = this.rows(
      Object.entries(over.scores).map(([id, score]) => ({ id, score, alive: true })),
    );
    const place = board.findIndex((r) => r.self) + 1;
    this.callbacks.onOver({
      win,
      oppLeft: this.oppLeft,
      mode: this.mode,
      selfScore: this.selfScore,
      oppScore: this.oppScore,
      board,
      place,
      stake: over.stake,
      pot: over.pot,
      rake: over.rake,
      net: win ? over.stake - over.rake : -over.stake,
    });
  }

  /** Bearing from the player's view to a world point (0 = ahead, + = right). */
  private bearingTo(target: Vec3): number {
    const f = forwardFromYaw(this.input.yaw);
    const r = rightFromYaw(this.input.yaw);
    const rel = { x: target.x - this.predicted.pos.x, z: target.z - this.predicted.pos.z };
    const along = rel.x * f.x + rel.z * f.z;
    const side = rel.x * r.x + rel.z * r.z;
    return Math.atan2(side, along);
  }

  private eye(): Vec3 {
    return {
      x: this.predicted.pos.x,
      y: this.predicted.pos.y + EYE_HEIGHT,
      z: this.predicted.pos.z,
    };
  }

  private syncCamera(): void {
    this.world.camera.position.set(
      this.predicted.pos.x,
      this.predicted.pos.y + EYE_HEIGHT,
      this.predicted.pos.z,
    );
    this.world.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
  }
}
