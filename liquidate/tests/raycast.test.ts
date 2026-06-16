import { describe, expect, it } from 'vitest';
import {
  HEAD_SPHERE,
  RIFLE,
  hitscan,
  hurtboxes,
  normalize,
  rayAABB,
  raySphere,
  v3,
  type AABB,
} from '@liquidate/shared';

describe('raySphere', () => {
  const sphere = { center: v3(0, 0, -10), radius: 1 };

  it('hits a sphere straight ahead', () => {
    const t = raySphere(v3(0, 0, 0), v3(0, 0, -1), sphere);
    expect(t).not.toBeNull();
    expect(t).toBeCloseTo(9); // surface is 1 unit before the centre
  });

  it('misses when pointing away', () => {
    expect(raySphere(v3(0, 0, 0), v3(0, 0, 1), sphere)).toBeNull();
  });

  it('misses when aimed to the side', () => {
    expect(raySphere(v3(0, 0, 0), v3(1, 0, 0), sphere)).toBeNull();
  });

  it('returns 0 when the origin is inside the sphere', () => {
    expect(raySphere(v3(0, 0, -10), v3(0, 0, -1), sphere)).toBe(0);
  });
});

describe('rayAABB', () => {
  const box: AABB = { min: v3(-1, -1, -11), max: v3(1, 1, -9) };

  it('hits a box straight ahead', () => {
    const t = rayAABB(v3(0, 0, 0), v3(0, 0, -1), box);
    expect(t).not.toBeNull();
    expect(t).toBeCloseTo(9);
  });

  it('misses when pointing away', () => {
    expect(rayAABB(v3(0, 0, 0), v3(0, 0, 1), box)).toBeNull();
  });

  it('misses when offset past the box', () => {
    expect(rayAABB(v3(5, 0, 0), v3(0, 0, -1), box)).toBeNull();
  });
});

describe('hitscan (occlusion + headshots)', () => {
  const target = hurtboxes(v3(0, 0, -10)); // dummy standing 10 units ahead
  const origin = v3(0, 0, 0);

  it('registers a body hit on a clear shot', () => {
    const dir = normalize(v3(0, target.body.center.y, target.body.center.z));
    const hit = hitscan(origin, dir, RIFLE.range, target, []);
    expect(hit).not.toBeNull();
    expect(hit?.headshot).toBe(false);
  });

  it('registers a headshot when aimed at the head', () => {
    const dir = normalize(v3(0, HEAD_SPHERE.centerY, -10));
    const hit = hitscan(origin, dir, RIFLE.range, target, []);
    expect(hit).not.toBeNull();
    expect(hit?.headshot).toBe(true);
  });

  it('is blocked by an obstacle between shooter and target (cover works)', () => {
    const wall: AABB = { min: v3(-2, 0, -6), max: v3(2, 3, -5) };
    const dir = normalize(v3(0, target.body.center.y, target.body.center.z));
    const hit = hitscan(origin, dir, RIFLE.range, target, [wall]);
    expect(hit).toBeNull();
  });

  it('still hits when the obstacle is behind the target', () => {
    const wallBehind: AABB = { min: v3(-2, 0, -16), max: v3(2, 3, -15) };
    const dir = normalize(v3(0, target.body.center.y, target.body.center.z));
    const hit = hitscan(origin, dir, RIFLE.range, target, [wallBehind]);
    expect(hit).not.toBeNull();
  });
});
