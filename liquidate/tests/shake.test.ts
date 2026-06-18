/**
 * Camera shake is combat juice, not aim. These tests lock that it's a bounded,
 * self-decaying COSMETIC offset on the camera: trauma drains to zero, the offset
 * is small and disappears at rest, and it only ever touches the camera passed in
 * (never input / aim). syncCamera overwrites the camera each frame in the real
 * loop, so this offset can't accumulate or feed back into where you aim.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Shake } from '../client/src/shake';

function freshCamera(): THREE.Object3D {
  return new THREE.Object3D();
}

describe('Shake (P3, camera-only juice)', () => {
  it('accumulates trauma and saturates at 1', () => {
    const s = new Shake();
    s.add(0.4);
    expect(s.value).toBeCloseTo(0.4);
    s.add(0.9);
    expect(s.value).toBe(1);
  });

  it('decays trauma back to zero over time', () => {
    const s = new Shake();
    const cam = freshCamera();
    s.add(1);
    for (let i = 0; i < 120; i++) s.update(1 / 60, cam as unknown as THREE.Camera); // 2s
    expect(s.value).toBe(0);
  });

  it('applies a bounded offset while shaking and none at rest', () => {
    const s = new Shake();
    const cam = freshCamera();

    // At rest: trauma 0 -> the camera is untouched.
    s.update(0.016, cam as unknown as THREE.Camera);
    expect(cam.rotation.x).toBe(0);
    expect(cam.rotation.z).toBe(0);
    expect(cam.position.x).toBe(0);

    // Shaking: offsets stay within the configured caps (~0.05).
    s.add(1);
    let maxRot = 0;
    let maxPos = 0;
    for (let i = 0; i < 30; i++) {
      cam.rotation.set(0, 0, 0);
      cam.position.set(0, 0, 0);
      s.add(1); // keep trauma high to probe the peak
      s.update(1 / 60, cam as unknown as THREE.Camera);
      maxRot = Math.max(maxRot, Math.abs(cam.rotation.z), Math.abs(cam.rotation.x));
      maxPos = Math.max(maxPos, Math.abs(cam.position.x), Math.abs(cam.position.y));
    }
    expect(maxRot).toBeGreaterThan(0); // it does shake
    expect(maxRot).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(maxPos).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('reset() clears trauma immediately', () => {
    const s = new Shake();
    s.add(1);
    s.reset();
    expect(s.value).toBe(0);
  });
});
