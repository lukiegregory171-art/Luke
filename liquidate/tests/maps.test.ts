/**
 * Map sanity (Phase B). Every map must have ≥2 spawns that are inside the arena
 * and NOT stuck inside an obstacle (a stuck spawn = an unplayable match), and the
 * vertical maps must actually have jumpable platforms to stand on. Geometry is
 * data, so this guards the data.
 */

import { describe, expect, it } from 'vitest';
import { MAP_LIST, resolveCollisions } from '@liquidate/shared';

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
});
