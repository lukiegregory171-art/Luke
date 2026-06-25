/**
 * The avatar (rigged glTF or procedural fallback) is PURELY COSMETIC. This locks
 * two invariants: (1) with no rig asset loaded, the factory returns the
 * procedural figure that satisfies the Avatar surface; (2) placing/animating/
 * re-skinning an avatar can never change a hitbox — server hitboxes are a pure
 * function of feet position, with no avatar parameter anywhere in the path.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hurtboxes } from '@liquidate/shared';
import { createAvatar } from '../client/src/avatar';
import { Character } from '../client/src/character';
import { Opponent } from '../client/src/opponent';

describe('avatar factory', () => {
  it('falls back to the procedural figure when no rig asset is loaded', () => {
    const scene = new THREE.Scene();
    const a = createAvatar(scene, { body: 0x0e1719, team: 0x2bd96b });
    expect(a).toBeInstanceOf(Character);
    for (const m of ['setTeam', 'place', 'setAlive', 'update', 'setHeld', 'reset', 'dispose']) {
      expect(typeof (a as unknown as Record<string, unknown>)[m]).toBe('function');
    }
    a.dispose();
  });
});

describe('avatar renders at a valid, visible position', () => {
  it('a placed avatar is visible and sits exactly at the given feet position', () => {
    const scene = new THREE.Scene();
    const a = createAvatar(scene, { body: 0x0e1719, team: 0xff4d4d });
    a.setAlive(true);
    a.place(4, 0, -3, 0.5);
    a.update(0.016, 0);

    expect(a.root.visible).toBe(true);
    expect(a.root.position.x).toBeCloseTo(4);
    expect(a.root.position.y).toBeCloseTo(0);
    expect(a.root.position.z).toBeCloseTo(-3);
    for (const c of [a.root.position.x, a.root.position.y, a.root.position.z]) {
      expect(Number.isFinite(c)).toBe(true);
    }
    a.dispose();
  });

  it('an opponent driven by snapshots ends up at the broadcast position (in scene)', () => {
    const scene = new THREE.Scene();
    const opp = new Opponent(scene);
    // Two snapshots bracketing the render time → interpolates onto (5, 0, 2).
    opp.pushFrame(1000, 5, 0, 2, 0, true);
    opp.pushFrame(1100, 5, 0, 2, 0, true);
    opp.update(1100, 0.016);

    // The avatar (or its debug marker) must be somewhere in the scene graph at a
    // finite, in-arena position — not lost at the origin/NaN or detached.
    let found = false;
    scene.traverse((o) => {
      if (o === scene) return;
      const p = o.position;
      if (Math.abs(p.x - 5) < 0.01 && Math.abs(p.z - 2) < 0.01) found = true;
    });
    expect(found).toBe(true);
    opp.dispose();
  });
});

describe('avatar is cosmetic — never affects hitboxes', () => {
  it('placing, animating, and re-skinning leave hitboxes untouched', () => {
    const scene = new THREE.Scene();
    const a = createAvatar(scene, { body: 0x0e1719, team: 0xff4d4d });

    const feet = { x: 3, y: 0, z: -2 };
    const before = hurtboxes(feet);

    a.place(feet.x, feet.y, feet.z, 1.0);
    a.update(0.2, 6); // animate a run
    a.setHeld('sniper', 'sniper_goldrush'); // cosmetic weapon + skin swap
    a.update(0.2, 0);

    // Hitboxes are derived only from feet position — there is no avatar input,
    // so the visual state cannot move them.
    expect(hurtboxes(feet)).toEqual(before);
    a.dispose();
  });
});
