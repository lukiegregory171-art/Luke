/**
 * Offline practice: a full local 1v1 against the {@link Bot}. Movement uses the
 * shared stepMovement and shooting uses the shared hitscan (same code as the
 * authoritative server), so it plays like a real duel — just simulated locally
 * with no networking. Good for warming up and for testing the feel solo.
 */

import {
  ASSAULT,
  DEFAULT_WEAPON,
  EYE_HEIGHT,
  MAX_HEALTH,
  WEAPONS,
  WEAPON_SWITCH_TIME,
  aimDirection,
  freshMagazines,
  forwardFromYaw,
  hitscan,
  hurtboxes,
  makeMoveState,
  nearestObstacle,
  perturbDirection,
  rightFromYaw,
  stepMovement,
  type GameMap,
  type MoveState,
  type Vec3,
  type WeaponId,
} from '@liquidate/shared';
import type { World } from './world';
import type { Input } from './input';
import type { Weapon } from './weapon';
import type { Hud } from './hud';
import type { Sfx } from './audio';
import type { Impacts } from './impacts';
import type { Shake } from './shake';
import { Bot } from './bot';

const STEP = 1 / 60;
const RESPAWN = 1.5;

export class Practice {
  readonly bot: Bot;

  private player: MoveState;
  private health = MAX_HEALTH;
  private alive = true;
  private respawnTimer = 0;
  private weapon: WeaponId = DEFAULT_WEAPON;
  private ammo: Record<WeaponId, number> = freshMagazines();
  private reloading = false;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private score = 0;
  private botScore = 0;
  private acc = 0;

  constructor(
    private readonly map: GameMap,
    private readonly world: World,
    private readonly input: Input,
    private readonly gun: Weapon,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
    private readonly impacts: Impacts,
    private readonly shake: Shake,
  ) {
    this.player = makeMoveState(map.spawns[0].pos);
    this.input.yaw = map.spawns[0].yaw;
    this.input.pitch = 0;
    this.bot = new Bot(world.scene, map.spawns[1].pos);

    this.input.onReload = () => this.startReload();
    this.input.onSwitch = (w) => this.switchWeapon(w);

    this.hud.setScores(0, 0);
    this.hud.setHealth(MAX_HEALTH);
    this.applyWeaponView();
    this.syncCamera();
  }

  update(dt: number): void {
    // Player movement (fixed steps for stable feel).
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.stepPlayer(STEP);
      this.acc -= STEP;
      steps++;
    }

    // Player timers + firing.
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawnPlayer();
    } else if (this.input.locked && this.input.firing) {
      this.tryFire();
    }

    // Bot acts, then resolves its shot against the player.
    const decision = this.bot.think(dt, this.eye(), this.map);
    if (decision.fire && this.alive) this.resolveBotShot();
    if (!this.bot.alive && this.bot.respawnTimer <= 0) this.bot.respawn(this.map.spawns[1].pos);

    this.syncCamera();
    const speed = Math.hypot(this.player.vel.x, this.player.vel.z);
    this.gun.update(dt, { speed, yaw: this.input.yaw, pitch: this.input.pitch });
    if (this.alive && this.input.locked) this.sfx.footsteps(dt, speed);
    this.hud.setFuel(this.player.fuel);
  }

  private stepPlayer(step: number): void {
    if (!this.alive) return;
    const canAct = this.input.locked;
    const k = this.input.keys;
    const moveFwd = canAct ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0;
    const moveRight = canAct ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0;
    const dash = canAct && this.input.consumeDash();
    if (dash) this.sfx.dash();
    const jump = canAct && this.input.consumeJump();
    const thrust = canAct && this.input.keys.has('Space');
    this.player = stepMovement(
      this.player,
      { moveFwd, moveRight, yaw: this.input.yaw, dash, jump, thrust },
      step,
      this.map,
    );
  }

  private tryFire(): void {
    const w = WEAPONS[this.weapon];
    if (this.fireCooldown > 0 || this.reloading || this.ammo[this.weapon] <= 0) return;
    this.fireCooldown = w.fireInterval;
    this.ammo[this.weapon]--;

    const eye = this.eye();
    const dir = aimDirection(this.input.yaw, this.input.pitch);
    const box = this.bot.alive ? this.bot.hurtboxes() : null;

    let damage = 0;
    let headshot = false;
    const ends: Vec3[] = [];
    for (let i = 0; i < w.pellets; i++) {
      const rayDir = perturbDirection(dir, w.spread);
      ends.push(this.endpoint(eye, rayDir, w.range));
      if (box) {
        const hit = hitscan(eye, rayDir, w.range, box, this.map.obstacles);
        if (hit) {
          damage += w.damage * (hit.headshot ? w.headshotMultiplier : 1);
          if (hit.headshot) headshot = true;
        }
      }
    }

    if (w.pellets > 1) this.gun.fireMany(ends);
    else this.gun.fire(ends[0]);
    for (const e of ends) this.impacts.spawn(e, 'surface');
    this.sfx.shoot(this.weapon);
    this.shake.add(w.pellets > 1 ? 0.28 : 0.16);
    this.hud.crosshairKick();

    if (damage > 0 && this.bot.alive) {
      this.hud.hit(headshot);
      this.sfx.hit(headshot);
      this.hud.damageNumber(Math.round(damage), headshot);
      const b = this.bot.feet;
      this.impacts.spawn({ x: b.x, y: b.y + 1.1, z: b.z }, 'flesh');
      if (this.bot.damage(Math.round(damage), RESPAWN)) {
        this.score++;
        this.hud.setScores(this.score, this.botScore);
        this.hud.addKill('YOU', 'BOT', headshot);
        this.hud.banner('OPPONENT DOWN', 'good');
        this.sfx.kill();
      }
    }

    this.hud.setAmmo(this.ammo[this.weapon], w.magazine);
    if (this.ammo[this.weapon] === 0) this.startReload();
  }

  private resolveBotShot(): void {
    const hit = hitscan(
      this.bot.eye,
      this.bot.aimDir(),
      ASSAULT.range,
      this.playerBox(),
      this.map.obstacles,
    );
    if (!hit) return;
    const dmg = Math.round(ASSAULT.damage * (hit.headshot ? ASSAULT.headshotMultiplier : 1));
    this.health -= dmg;
    this.hud.setHealth(Math.max(0, this.health));
    this.hud.damageFlash();
    this.hud.damageFrom(this.bearingTo(this.bot.feet));
    this.shake.add(hit.headshot ? 0.5 : 0.38);
    if (this.health <= 0 && this.alive) {
      this.alive = false;
      this.respawnTimer = RESPAWN;
      this.botScore++;
      this.hud.setScores(this.score, this.botScore);
      this.hud.addKill('BOT', 'YOU', hit.headshot);
      this.hud.banner('YOU DIED', 'bad');
      this.sfx.death();
    }
  }

  private switchWeapon(w: WeaponId): void {
    if (this.weapon === w || !WEAPONS[w]) return;
    this.weapon = w;
    this.reloading = false;
    this.fireCooldown = Math.max(this.fireCooldown, WEAPON_SWITCH_TIME);
    this.applyWeaponView();
  }

  private applyWeaponView(): void {
    this.gun.setWeapon(this.weapon);
    this.hud.setWeapon(this.weapon);
    this.hud.setAmmo(this.ammo[this.weapon], WEAPONS[this.weapon].magazine);
  }

  private startReload(): void {
    const w = WEAPONS[this.weapon];
    if (this.reloading || this.ammo[this.weapon] === w.magazine || !this.alive) return;
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    this.hud.setReloading(true);
    this.sfx.reload();
  }

  private finishReload(): void {
    this.reloading = false;
    this.ammo[this.weapon] = WEAPONS[this.weapon].magazine;
    this.hud.setReloading(false);
    this.hud.setAmmo(this.ammo[this.weapon], WEAPONS[this.weapon].magazine);
  }

  private respawnPlayer(): void {
    this.player = makeMoveState(this.map.spawns[0].pos);
    this.input.yaw = this.map.spawns[0].yaw;
    this.input.pitch = 0;
    this.health = MAX_HEALTH;
    this.ammo = freshMagazines();
    this.weapon = DEFAULT_WEAPON;
    this.reloading = false;
    this.fireCooldown = 0;
    this.alive = true;
    this.hud.setHealth(MAX_HEALTH);
    this.applyWeaponView();
  }

  private endpoint(eye: Vec3, dir: Vec3, range: number): Vec3 {
    const dist = Math.min(nearestObstacle(eye, dir, this.map.obstacles), range, 80);
    return { x: eye.x + dir.x * dist, y: eye.y + dir.y * dist, z: eye.z + dir.z * dist };
  }

  private playerBox(): ReturnType<typeof hurtboxes> {
    return hurtboxes(this.player.pos);
  }

  private bearingTo(target: Vec3): number {
    const f = forwardFromYaw(this.input.yaw);
    const r = rightFromYaw(this.input.yaw);
    const rel = { x: target.x - this.player.pos.x, z: target.z - this.player.pos.z };
    return Math.atan2(rel.x * r.x + rel.z * r.z, rel.x * f.x + rel.z * f.z);
  }

  private eye(): Vec3 {
    return { x: this.player.pos.x, y: this.player.pos.y + EYE_HEIGHT, z: this.player.pos.z };
  }

  private syncCamera(): void {
    this.world.camera.position.set(
      this.player.pos.x,
      this.player.pos.y + EYE_HEIGHT,
      this.player.pos.z,
    );
    this.world.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
  }
}
