/**
 * Manages the set of remote players (1 in a duel, up to 5 in FFA), creating and
 * removing {@link Opponent} avatars as ids appear/leave the snapshots. Each is
 * interpolated independently. Cosmetic only — hits are server-decided.
 */

import * as THREE from 'three';
import type { WeaponId } from '@liquidate/shared';
import { Opponent } from './opponent';

export class Opponents {
  private readonly byId = new Map<string, Opponent>();

  constructor(private readonly scene: THREE.Scene) {}

  /** Buffer an authoritative frame for a player id (creating its avatar). */
  pushFrame(
    id: string,
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
    let o = this.byId.get(id);
    if (!o) {
      o = new Opponent(this.scene);
      this.byId.set(id, o);
    }
    o.pushFrame(serverTime, x, y, z, yaw, alive, weapon, skinId, reloading);
  }

  /** Trigger a player's one-shot shoot animation (from their fire events). */
  triggerShoot(id: string): void {
    this.byId.get(id)?.triggerShoot();
  }

  /** Drop any avatars whose ids are no longer present (left the match). */
  retainOnly(ids: Set<string>): void {
    for (const [id, o] of this.byId) {
      if (!ids.has(id)) {
        o.dispose();
        this.byId.delete(id);
      }
    }
  }

  update(renderTime: number, dt: number): void {
    for (const o of this.byId.values()) o.update(renderTime, dt);
  }

  /** Team tint a player (ally vs enemy in TDM). */
  setColor(id: string, hex: number): void {
    this.byId.get(id)?.setColor(hex);
  }

  /** Latest feet position of a given player (for impacts / damage direction). */
  positionOf(id: string): { x: number; z: number } | undefined {
    return this.byId.get(id)?.position();
  }

  reset(): void {
    for (const o of this.byId.values()) o.dispose();
    this.byId.clear();
  }
}
