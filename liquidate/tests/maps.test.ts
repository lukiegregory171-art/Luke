/**
 * Map sanity (Phase B). Every map must have ≥2 spawns that are inside the arena
 * and NOT stuck inside an obstacle (a stuck spawn = an unplayable match), and the
 * vertical maps must actually have jumpable platforms to stand on. Geometry is
 * data, so this guards the data.
 */

import { describe, expect, it } from 'vitest';
import { GRAVITY, JUMP_SPEED, MAP_LIST, resolveCollisions } from '@liquidate/shared';

describe('maps', () => {
  it('every map has >=2 spawns, in-bounds and clear of obstacles', () => {
    for (const map of MAP_LIST) {
      expect(map.spawns.length).toBeGreaterThanOrEqual(2);
      const halfW = map.width / 2;
      const halfD = map.depth / 2;
      for (const s of map.spawns) {
        expect(Math.abs(s.pos.x)).toBeLessThan(halfW);
        expect(Math.abs(s.pos.z)).toBeLessThan(halfD);
        // At ground level a spawn must not be pushed out of an obstacle.
        const r = resolveCollisions({ x: s.pos.x, y: 0, z: s.pos.z }, map, 0);
        expect(Math.hypot(r.x - s.pos.x, r.z - s.pos.z)).toBeLessThan(0.01);
      }
    }
  });

  it('the vertical maps have jumpable platforms (≤ jump height) to stand on', () => {
    for (const id of ['datacenter', 'tradingfloor']) {
      const map = MAP_LIST.find((m) => m.id === id)!;
      const jumpable = map.obstacles.filter((b) => b.max.y > 0.3 && b.max.y <= 1.5);
      expect(jumpable.length).toBeGreaterThan(0);
    }
  });

  it('raised catwalks (floating platforms) are reachable in two hops and walkable under', () => {
    const jumpReach = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY); // jump peak height
    let totalRaised = 0;
    for (const map of MAP_LIST) {
      const raised = map.obstacles.filter((b) => b.min.y > 0.01);
      totalRaised += raised.length;
      // Surfaces reachable from the ground in one jump (incl. the ground itself).
      const groundReach = [
        0,
        ...map.obstacles
          .filter((b) => b.min.y <= 0.01 && b.max.y <= jumpReach + 1e-6)
          .map((b) => b.max.y),
      ];
      for (const b of raised) {
        // Within one jump of a ground-reachable surface (two hops from the floor).
        const reachable = groundReach.some((t) => t <= b.max.y && b.max.y - t <= jumpReach + 1e-6);
        expect(reachable).toBe(true);
        // And a ~1.8 m player clears the underside (genuine second level).
        expect(b.min.y).toBeGreaterThanOrEqual(1.8);
      }
    }
    expect(totalRaised).toBeGreaterThan(0); // the upper levels exist
  });

  it('jump pads are in-bounds, positive-radius, and clear of ground cover', () => {
    let totalPads = 0;
    for (const map of MAP_LIST) {
      const halfW = map.width / 2;
      const halfD = map.depth / 2;
      for (const p of map.jumpPads ?? []) {
        totalPads++;
        expect(p.r).toBeGreaterThan(0);
        expect(Math.abs(p.x) + p.r).toBeLessThan(halfW);
        expect(Math.abs(p.z) + p.r).toBeLessThan(halfD);
        // A pad must sit on open floor — not inside a GROUND obstacle's footprint
        // (it launches off the floor, so it can't be buried under low cover).
        for (const b of map.obstacles) {
          if (b.min.y > 0.01) continue; // raised catwalks float above — fine
          const insideX = p.x > b.min.x && p.x < b.max.x;
          const insideZ = p.z > b.min.z && p.z < b.max.z;
          expect(insideX && insideZ).toBe(false);
        }
      }
    }
    expect(totalPads).toBeGreaterThan(0);
  });
});
