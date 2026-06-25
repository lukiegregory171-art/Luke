/**
 * P2 invariant: the animated character is COSMETIC. Animation moves only child
 * limbs — never the root — so it can't move the player, and hurtboxes stay a
 * pure function of the authoritative feet position (what you shoot is the
 * server's sphere, not the animated mesh). These tests would fail if a future
 * change let animation drift the root or coupled hitboxes to the visual rig.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BODY_SPHERE, HEAD_SPHERE, hurtboxes } from '@liquidate/shared';
import { Character } from '../client/src/character';

function makeCharacter() {
  const scene = new THREE.Scene();
  return new Character(scene, { body: 0x0e1719, team: 0xff3b47 });
}

describe('Character (P2, cosmetic-only)', () => {
  it('keeps the root pinned to the authoritative position while animating', () => {
    const c = makeCharacter();
    c.place(3, 0, -2, 1.0);
    for (let i = 0; i < 60; i++) c.update(0.016, 6); // a second of running
    expect(c.root.position.x).toBe(3);
    expect(c.root.position.y).toBe(0);
    expect(c.root.position.z).toBe(-2);
    expect(c.root.rotation.y).toBe(1.0);
  });

  it('actually animates the limbs when moving (non-vacuous)', () => {
    const c = makeCharacter();
    c.place(0, 0, 0, 0);
    let maxSwing = 0;
    for (let i = 0; i < 30; i++) {
      c.update(0.05, 6);
      const leg = c.root.getObjectByName('legL')!;
      maxSwing = Math.max(maxSwing, Math.abs(leg.rotation.x));
    }
    expect(maxSwing).toBeGreaterThan(0.1);
  });

  it('holds limbs still when idle (speed ~0)', () => {
    const c = makeCharacter();
    c.place(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) c.update(0.05, 0);
    const leg = c.root.getObjectByName('legL')!;
    expect(leg.rotation.x).toBe(0); // no stride at zero speed
  });

  it('does not move the hitboxes — those are a pure function of feet', () => {
    const c = makeCharacter();
    const feet = { x: 3, y: 0, z: -2 };
    c.place(feet.x, feet.y, feet.z, 1.0);
    for (let i = 0; i < 30; i++) c.update(0.05, 6);

    // Hurtboxes come from shared, derived only from feet — the animated rig
    // (limbs swinging, torso bobbing) can't shift them.
    const boxes = hurtboxes(feet);
    expect(boxes.body.center).toEqual({ x: 3, y: BODY_SPHERE.centerY, z: -2 });
    expect(boxes.head.center).toEqual({ x: 3, y: HEAD_SPHERE.centerY, z: -2 });
  });

  it('death topples the body but never moves the root, then clears it', () => {
    const c = makeCharacter();
    c.place(5, 0, 5, 0);
    c.update(0.016, 0); // become visible (alive)
    expect(c.root.visible).toBe(true);

    c.setAlive(false);
    for (let i = 0; i < 40; i++) c.update(0.05, 0); // well past the death time
    expect(c.root.visible).toBe(false); // corpse cleared
    // Root never moved — only the child frame toppled.
    expect(c.root.position.x).toBe(5);
    expect(c.root.position.z).toBe(5);

    // Respawn restores an upright, visible character at the same root.
    c.setAlive(true);
    c.update(0.016, 0);
    expect(c.root.visible).toBe(true);
  });
});
