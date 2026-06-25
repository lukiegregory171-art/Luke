/**
 * Impact effects are pooled, so a firefight must not leak or grow without bound.
 * These tests check the lifecycle: spawned impacts go active, expire after their
 * lifetime back into the pool, and reset() clears them — proving the recycling
 * the P1 pool guarantees holds at the Impacts layer too.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Impacts } from '../client/src/impacts';

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return { impacts: new Impacts(scene), camera };
}

describe('Impacts (P3, pooled)', () => {
  it('activates on spawn and retires after the lifetime', () => {
    const { impacts, camera } = setup();
    impacts.spawn({ x: 0, y: 1, z: 0 }, 'surface');
    impacts.spawn({ x: 1, y: 1, z: 0 }, 'flesh');
    expect(impacts.activeCount).toBe(2);

    // Advance well past the ~0.18s lifetime.
    for (let i = 0; i < 20; i++) impacts.update(0.02, camera);
    expect(impacts.activeCount).toBe(0);
  });

  it('handles a burst (e.g. a shotgun blast) without leaking', () => {
    const { impacts, camera } = setup();
    for (let i = 0; i < 8; i++) impacts.spawn({ x: i, y: 1, z: 0 }, 'surface');
    expect(impacts.activeCount).toBe(8);
    for (let i = 0; i < 20; i++) impacts.update(0.02, camera);
    expect(impacts.activeCount).toBe(0);

    // A second burst reuses the freed impacts (no runaway growth).
    for (let i = 0; i < 8; i++) impacts.spawn({ x: i, y: 1, z: 0 }, 'flesh');
    expect(impacts.activeCount).toBe(8);
  });

  it('reset() retires everything immediately', () => {
    const { impacts } = setup();
    impacts.spawn({ x: 0, y: 1, z: 0 }, 'surface');
    impacts.spawn({ x: 0, y: 1, z: 1 }, 'surface');
    impacts.reset();
    expect(impacts.activeCount).toBe(0);
  });
});
