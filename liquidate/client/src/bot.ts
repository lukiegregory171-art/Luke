/**
 * A local practice bot: a self-contained AI opponent for offline play. It moves
 * with the SHARED movement code and is shot with the SHARED hitscan (the same
 * functions the authoritative server uses), so practice behaves like a real
 * duel. The AI keeps mid-range, strafes, takes line-of-sight into account, and
 * aims imperfectly so it's beatable and fair.
 */

import * as THREE from 'three';
import {
  EYE_HEIGHT,
  MAX_HEALTH,
  ASSAULT,
  aimAngles,
  clamp,
  hurtboxes,
  makeMoveState,
  nearestObstacle,
  stepMovement,
  type GameMap,
  type MoveState,
  type Vec3,
} from '@liquidate/shared';
import { Character } from './character';
import { COLORS } from './palette';

const TURN_RATE = 5.5; // rad/s aim slew
const DESIRED_RANGE = 11; // metres the bot tries to hold
const AIM_JITTER = 0.035; // radians of imperfect aim

export interface BotDecision {
  moveFwd: number;
  moveRight: number;
  fire: boolean;
}

export class Bot {
  move: MoveState;
  yaw = 0;
  pitch = 0;
  health = MAX_HEALTH;
  alive = true;
  respawnTimer = 0;

  /** Disables AI movement/firing (used for a calm target and by tests). */
  passive = false;

  private readonly character: Character;
  private ammo = ASSAULT.magazine;
  private fireCd = 0;
  private reloadTimer = 0;
  private strafe = 1;
  private repath = 0;

  constructor(scene: THREE.Scene, spawn: Vec3) {
    this.move = makeMoveState(spawn);
    // Red-visor team tint to distinguish the bot from a networked opponent.
    this.character = new Character(scene, { body: 0x0e1719, team: COLORS.red });
    this.renderAvatar(0); // place + show upright at spawn
  }

  get feet(): Vec3 {
    return this.move.pos;
  }

  get eye(): Vec3 {
    return { x: this.move.pos.x, y: this.move.pos.y + EYE_HEIGHT, z: this.move.pos.z };
  }

  hurtboxes(): ReturnType<typeof hurtboxes> {
    return hurtboxes(this.move.pos);
  }

  /** Unit aim direction (with a tiny random jitter to keep it fair). */
  aimDir(): Vec3 {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  damage(amount: number, respawnDelay: number): boolean {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.respawnTimer = respawnDelay;
      this.character.setAlive(false); // play the death topple
      return true;
    }
    return false;
  }

  respawn(at: Vec3): void {
    this.move = makeMoveState(at);
    this.health = MAX_HEALTH;
    this.ammo = ASSAULT.magazine;
    this.fireCd = 0;
    this.reloadTimer = 0;
    this.alive = true;
    this.character.setAlive(true);
    this.renderAvatar(0);
  }

  /** Decide what to do this step and advance the bot's own movement. */
  think(dt: number, playerEye: Vec3, map: GameMap): BotDecision {
    if (!this.alive) {
      this.respawnTimer -= dt;
      this.renderAvatar(dt); // advance the death topple
      return { moveFwd: 0, moveRight: 0, fire: false };
    }

    // Aim toward the player, slewing for a human-ish reaction.
    const want = aimAngles({
      x: playerEye.x - this.eye.x,
      y: playerEye.y - this.eye.y,
      z: playerEye.z - this.eye.z,
    });
    this.yaw += clamp(angleDiff(this.yaw, want.yaw), -TURN_RATE * dt, TURN_RATE * dt);
    this.pitch += clamp(want.pitch - this.pitch, -TURN_RATE * dt, TURN_RATE * dt);

    if (this.passive) {
      this.renderAvatar(dt);
      return { moveFwd: 0, moveRight: 0, fire: false };
    }

    // Reload / fire-rate timers.
    if (this.fireCd > 0) this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = ASSAULT.magazine;
    }

    const toPlayer = {
      x: playerEye.x - this.eye.x,
      y: playerEye.y - this.eye.y,
      z: playerEye.z - this.eye.z,
    };
    const dist = Math.hypot(toPlayer.x, toPlayer.z);
    const hasLos = nearestObstacle(this.eye, norm(toPlayer), map.obstacles) > dist;

    // Movement: hold range and strafe; flip strafe direction periodically.
    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 0.8 + Math.random() * 1.2;
      this.strafe = Math.random() < 0.5 ? -1 : 1;
    }
    const moveFwd = clamp((dist - DESIRED_RANGE) / 4, -1, 1);
    const moveRight = this.strafe;

    this.move = stepMovement(this.move, { moveFwd, moveRight, yaw: this.yaw }, dt, map);
    this.renderAvatar(dt);

    // Fire when aimed, in range, with line of sight.
    const aimErr = Math.abs(angleDiff(this.yaw, want.yaw)) + Math.abs(this.pitch - want.pitch);
    let fire = false;
    if (hasLos && dist <= ASSAULT.range && aimErr < 0.12 && this.reloadTimer <= 0) {
      if (this.ammo <= 0) {
        this.reloadTimer = ASSAULT.reloadTime;
      } else if (this.fireCd <= 0) {
        this.ammo--;
        this.fireCd = ASSAULT.fireInterval;
        // Apply jitter to this shot's aim.
        this.yaw += (Math.random() * 2 - 1) * AIM_JITTER;
        this.pitch += (Math.random() * 2 - 1) * AIM_JITTER;
        fire = true;
      }
    }
    return { moveFwd, moveRight, fire };
  }

  /** Place + animate the cosmetic character from the bot's authoritative state. */
  private renderAvatar(dt: number): void {
    const speed = Math.hypot(this.move.vel.x, this.move.vel.z);
    this.character.place(this.move.pos.x, this.move.pos.y, this.move.pos.z, this.yaw);
    this.character.update(dt, speed);
  }
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
