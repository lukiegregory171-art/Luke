/**
 * The solo practice game loop. Movement uses the shared `stepMovement` (the same
 * code the server will run in M2), and shooting uses the shared `hitscan` with
 * occlusion. Nothing here is networked yet — this milestone is about feel.
 */

import {
  EYE_HEIGHT,
  RIFLE,
  aimDirection,
  hitscan,
  nearestObstacle,
  stepMovement,
  type GameMap,
  type MoveInput,
  type Vec3,
} from '@liquidate/shared';
import type { World } from './world';
import type { Input } from './input';
import type { Weapon } from './weapon';
import type { Dummy } from './dummy';
import type { Hud } from './hud';

const TRACER_MAX = 80; // visual length cap for a tracer that hits nothing

export class Game {
  private feet: Vec3;
  private ammo = RIFLE.magazine;
  private reloading = false;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private score = 0;

  constructor(
    private readonly map: GameMap,
    private readonly world: World,
    private readonly input: Input,
    private readonly weapon: Weapon,
    private readonly dummy: Dummy,
    private readonly hud: Hud,
  ) {
    const spawn = map.spawns[0];
    this.feet = { ...spawn.pos };
    this.input.yaw = spawn.yaw;
    this.input.onReload = () => this.startReload();
    this.hud.setAmmo(this.ammo, RIFLE.magazine);
    this.hud.setScore(0);
    this.syncCamera();
  }

  /** Current player feet position (used by the dummy to avoid spawning on you). */
  get playerFeet(): Vec3 {
    return this.feet;
  }

  /** Advance one frame. `dt` is already clamped by the caller. */
  update(dt: number): void {
    this.move(dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.input.firing) this.tryFire();

    this.dummy.update(dt);
    this.weapon.update(dt);
  }

  private move(dt: number): void {
    const k = this.input.keys;
    const moveFwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const moveRight = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const input: MoveInput = { moveFwd, moveRight, yaw: this.input.yaw };
    this.feet = stepMovement(this.feet, input, dt, this.map);
    this.syncCamera();
  }

  private syncCamera(): void {
    this.world.camera.position.set(this.feet.x, this.feet.y + EYE_HEIGHT, this.feet.z);
    this.world.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
  }

  private tryFire(): void {
    if (this.reloading || this.fireCooldown > 0) return;
    if (this.ammo <= 0) {
      this.startReload();
      return;
    }

    this.ammo--;
    this.fireCooldown = RIFLE.fireInterval;
    this.hud.setAmmo(this.ammo, RIFLE.magazine);

    const eye: Vec3 = {
      x: this.world.camera.position.x,
      y: this.world.camera.position.y,
      z: this.world.camera.position.z,
    };
    const dir = aimDirection(this.input.yaw, this.input.pitch);

    const hit = this.dummy.alive
      ? hitscan(eye, dir, RIFLE.range, this.dummy.hurtboxes(), this.map.obstacles)
      : null;

    // Tracer endpoint: the hit, else a wall, else a capped distance.
    const wall = nearestObstacle(eye, dir, this.map.obstacles);
    const dist = hit ? hit.t : Math.min(wall, TRACER_MAX);
    const end: Vec3 = { x: eye.x + dir.x * dist, y: eye.y + dir.y * dist, z: eye.z + dir.z * dist };
    this.weapon.fire(end);

    if (hit) {
      const damage = RIFLE.damage * (hit.headshot ? RIFLE.headshotMultiplier : 1);
      this.hud.hit(hit.headshot);
      if (this.dummy.damage(damage)) {
        this.score++;
        this.hud.setScore(this.score);
      }
    }

    if (this.ammo === 0) this.startReload();
  }

  private startReload(): void {
    if (this.reloading || this.ammo === RIFLE.magazine) return;
    this.reloading = true;
    this.reloadTimer = RIFLE.reloadTime;
    this.hud.setReloading(true);
  }

  private finishReload(): void {
    this.reloading = false;
    this.ammo = RIFLE.magazine;
    this.hud.setReloading(false);
    this.hud.setAmmo(this.ammo, RIFLE.magazine);
  }
}
