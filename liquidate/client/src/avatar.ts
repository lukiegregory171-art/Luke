/**
 * Avatar abstraction: the visible player body used by networked opponents and
 * the practice bot. Two implementations share this surface:
 *  - {@link RiggedCharacter} — a real CC0 rigged glTF with AnimationMixer
 *    crossfades (used when the avatar asset has loaded), and
 *  - {@link Character} — the procedural articulated figure (zero-asset fallback).
 *
 * Either way the avatar is PURELY COSMETIC: it is placed from authoritative
 * server state and never participates in hit detection (server hitboxes are
 * spheres from feet position). `createAvatar` picks the rig when available.
 */

import type * as THREE from 'three';
import type { WeaponId } from '@liquidate/shared';
import { Character, type CharacterColors } from './character';
import { RiggedCharacter } from './riggedcharacter';
import { hasAvatarSource } from './avatarsource';

export interface Avatar {
  readonly root: THREE.Object3D;
  setTeam(color: number): void;
  place(x: number, y: number, z: number, yaw: number): void;
  setAlive(alive: boolean): void;
  update(dt: number, speed: number): void;
  setHeld(weapon: WeaponId, skinId: string | undefined): void;
  reset(): void;
  dispose(): void;
  // Optional richer signals (the rig uses them; the procedural figure ignores).
  setAirborne?(airborne: boolean): void;
  triggerShoot?(): void;
  setReloading?(reloading: boolean): void;
}

/** Rigged glTF avatar when its asset is loaded; procedural figure otherwise. */
export function createAvatar(scene: THREE.Scene, colors: CharacterColors): Avatar {
  if (hasAvatarSource()) return new RiggedCharacter(scene, colors);
  return new Character(scene, colors);
}
