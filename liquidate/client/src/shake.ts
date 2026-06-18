/**
 * Camera shake (P3) — trauma-based screen shake for combat juice (firing,
 * taking damage). Trauma rises on events and decays each second; the visible
 * shake scales with trauma² so small hits are subtle and big ones snap.
 *
 * AUTHORITY-SAFE, and that's the point: this only adds a transient offset to the
 * CAMERA after it's been positioned from input each frame. It never touches
 * input.yaw/pitch (the only aim the server sees), and because syncCamera rewrites
 * the camera transform every frame, the offset can't accumulate or feed back
 * into where you're actually aiming. It's pure presentation.
 */

import type * as THREE from 'three';

const DECAY = 1.8; // trauma drained per second
const MAX_ANGLE = 0.05; // ~2.9° peak roll/pitch at full trauma
const MAX_OFFSET = 0.05; // metres of peak positional jitter

export class Shake {
  private trauma = 0;
  private t = 0;

  /** Add trauma in [0,1]; bigger events add more. Saturates at 1. */
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Current trauma (for tests / inspection). */
  get value(): number {
    return this.trauma;
  }

  reset(): void {
    this.trauma = 0;
  }

  /** Apply the offset to the camera AFTER it's been set from input this frame. */
  update(dt: number, camera: THREE.Camera): void {
    this.t += dt;
    if (this.trauma <= 0) return;
    const s = this.trauma * this.trauma;
    const ang = MAX_ANGLE * s;
    const pos = MAX_OFFSET * s;
    // Deterministic multi-frequency noise per channel (roll + pitch + shift).
    camera.rotation.z += ang * this.noise(37, 0);
    camera.rotation.x += ang * 0.6 * this.noise(29, 1.3);
    camera.position.x += pos * this.noise(41, 2.1);
    camera.position.y += pos * this.noise(33, 0.7);
    this.trauma = Math.max(0, this.trauma - dt * DECAY);
  }

  private noise(freq: number, phase: number): number {
    return Math.sin(this.t * freq + phase);
  }
}
