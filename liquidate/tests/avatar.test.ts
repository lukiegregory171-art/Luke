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
