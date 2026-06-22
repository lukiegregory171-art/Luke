/**
 * The remote player, rendered with entity interpolation: snapshots are buffered
 * and the avatar is drawn ~100 ms in the past, lerping between the two snapshots
 * that bracket the render time. This trades a little latency for smooth motion.
 *
 * The visible body is an animated {@link Character} (P2); its run cycle is driven
 * by the interpolated server speed. The character is cosmetic — hits are decided
 * server-side against `hurtboxes(feet)`, never against this mesh.
 */

import * as THREE from 'three';
import { DEFAULT_WEAPON, type WeaponId } from '@liquidate/shared';
import { createAvatar, type Avatar } from './avatar';
import { COLORS } from './palette';

interface Frame {
  t: number; // server time (ms)
  x: number;
  y: number;
  z: number;
  yaw: number;
  alive: boolean;
}

const MAX_FRAMES = 40;

export class Opponent {
  private readonly character: Avatar;
  private readonly buffer: Frame[] = [];
  private weapon: WeaponId = DEFAULT_WEAPON;
  private skinId?: string;
  private reloading = false;
  private appliedWeapon?: WeaponId;
  private appliedSkin?: string;

  constructor(scene: THREE.Scene) {
    // Enemy: dark visor, RED team body (locked readability).
    this.character = createAvatar(scene, { body: 0x0e1719, team: COLORS.red });
  }

  /** One-shot shoot animation (driven by the opponent's fire events). */
  triggerShoot(): void {
    this.character.triggerShoot?.();
  }

  /** Clear interpolation state between matches and hide the avatar. */
  reset(): void {
    this.buffer.length = 0;
    this.character.reset();
  }

  /** Team tint (ally vs enemy in TDM). */
  setColor(hex: number): void {
    this.character.setTeam(hex);
  }

  /** Free GPU resources + remove from the scene (when this player leaves). */
  dispose(): void {
    this.character.dispose();
  }

  /** Latest known feet position (for impacts / damage indicators). */
  position(): { x: number; z: number } | undefined {
    const f = this.buffer[this.buffer.length - 1];
    return f ? { x: f.x, z: f.z } : undefined;
  }

  pushFrame(
    serverTime: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    alive: boolean,
    weapon?: WeaponId,
    skinId?: string,
    reloading?: boolean,
  ): void {
    this.buffer.push({ t: serverTime, x, y, z, yaw, alive });
    if (this.buffer.length > MAX_FRAMES) this.buffer.shift();
    if (weapon) this.weapon = weapon;
    this.skinId = skinId;
    this.reloading = reloading ?? false;
  }

  /** Render the opponent at the given (server-time) render moment. */
  update(renderTime: number, dt: number): void {
    if (this.buffer.length === 0) {
      this.character.setAlive(false);
      this.character.update(dt, 0);
      return;
    }

    // Find the two frames bracketing renderTime.
    let older = this.buffer[0];
    let newer = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].t <= renderTime && this.buffer[i + 1].t >= renderTime) {
        older = this.buffer[i];
        newer = this.buffer[i + 1];
        break;
      }
    }

    const span = newer.t - older.t;
    const f = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.t) / span)) : 0;

    const x = older.x + (newer.x - older.x) * f;
    const y = older.y + (newer.y - older.y) * f;
    const z = older.z + (newer.z - older.z) * f;
    const yaw = older.yaw + shortestAngle(older.yaw, newer.yaw) * f;

    // Interpolated server speed (m/s) drives the walk cadence.
    const speed = span > 0 ? Math.hypot(newer.x - older.x, newer.z - older.z) / (span / 1000) : 0;

    this.character.place(x, y, z, yaw);
    this.character.setAlive(newer.alive);
    this.character.setAirborne?.(y > 0.25); // feet above the floor → jumping
    this.character.setReloading?.(this.reloading);
    this.character.update(dt, speed);

    // Apply the broadcast weapon + cosmetic skin when it changes (cheap; the
    // model only rebuilds on a weapon switch).
    if (this.weapon !== this.appliedWeapon || this.skinId !== this.appliedSkin) {
      this.character.setHeld(this.weapon, this.skinId);
      this.appliedWeapon = this.weapon;
      this.appliedSkin = this.skinId;
    }
  }
}

function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
