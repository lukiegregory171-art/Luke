// Minimal ray/AABB math shared by the server's authoritative hit detection.
// (Kept dependency-free so it can run in plain Node with no THREE.js.)

import { PLAYER_RADIUS, PLAYER_HEIGHT } from './constants.js';

// Slab method. Returns the entry distance t along the ray, or null if no hit.
export function rayIntersectsAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0;
  let tmax = Infinity;

  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];

  for (const [o, d, min, max] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function playerHitbox(px, py, pz) {
  return {
    minX: px - PLAYER_RADIUS, maxX: px + PLAYER_RADIUS,
    minY: py, maxY: py + PLAYER_HEIGHT,
    minZ: pz - PLAYER_RADIUS, maxZ: pz + PLAYER_RADIUS,
  };
}

// Nearest world-geometry obstruction distance along the ray (for line-of-sight
// blocking), ignoring the flat ground slab which sits below normal eye rays.
export function nearestWorldHit(ox, oy, oz, dx, dy, dz, colliders, maxDist) {
  let nearest = maxDist;
  for (const c of colliders) {
    if (c.type === 'ground') continue;
    const t = rayIntersectsAABB(ox, oy, oz, dx, dy, dz, c);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}
