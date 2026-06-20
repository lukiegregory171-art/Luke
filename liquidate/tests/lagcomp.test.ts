/**
 * Lag-compensation unit tests: history interpolation, and a favor-the-shooter
 * scenario showing that rewinding the target to its past position lands a shot
 * that aims where the high-latency shooter SAW the target — while resolving at
 * the target's present position would miss.
 */

import { describe, expect, it } from 'vitest';
import { ASSAULT, aimAngles, hitscan, hurtboxes, sampleHistory, sub, v3 } from '@liquidate/shared';

describe('sampleHistory', () => {
  const history = [
    { t: 1000, x: 0, z: 0 },
    { t: 1100, x: 2, z: 0 },
    { t: 1200, x: 4, z: 0 },
  ];

  it('interpolates between samples', () => {
    expect(sampleHistory(history, 1050)).toEqual({ x: 1, z: 0 });
    expect(sampleHistory(history, 1150)).toEqual({ x: 3, z: 0 });
  });

  it('clamps to the ends', () => {
    expect(sampleHistory(history, 500)).toEqual({ x: 0, z: 0 });
    expect(sampleHistory(history, 9999)).toEqual({ x: 4, z: 0 });
  });

  it('returns null for empty history', () => {
    expect(sampleHistory([], 1000)).toBeNull();
  });
});

describe('favor-the-shooter rewind', () => {
  // A target strafing along +X; the shooter (high latency) sees it ~150ms in the
  // past, at x = 0, and aims there. The present target is at x = 3.
  const now = 2000;
  const history = [
    { t: now - 150, x: 0, z: 10 },
    { t: now, x: 3, z: 10 },
  ];
  const eye = v3(0, 1.6, 0);
  const aimAtPast = aimAngles(sub({ x: 0, y: 1.65, z: 10 }, eye)); // aim where it was

  function shoot(feetX: number) {
    const dir = aimDir(aimAtPast.yaw, aimAtPast.pitch);
    return hitscan(eye, dir, ASSAULT.range, hurtboxes(v3(feetX, 0, 10)), []);
  }

  it('hits the rewound position but misses the present one', () => {
    const past = sampleHistory(history, now - 150)!;
    expect(past.x).toBeCloseTo(0);
    expect(shoot(past.x)).not.toBeNull(); // rewound => hit (fair)
    const present = sampleHistory(history, now)!;
    expect(shoot(present.x)).toBeNull(); // present => miss
  });
});

// local copy of aimDirection to avoid importing more than needed
function aimDir(yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
