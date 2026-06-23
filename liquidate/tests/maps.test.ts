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
});
