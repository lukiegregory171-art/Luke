/**
 * Ray casting for hit detection — shared so the client (M1 practice hits) and
 * the server (M2 authoritative hitscan) use identical math.
 *
 * A player's hurtbox is two spheres (body + head) stacked on the feet position.
 * A shot connects only if a target sphere is struck *before* any occluding map
 * obstacle, so cover works. Directions passed in must be unit length.
 */

import { BODY_SPHERE, HEAD_SPHERE } from './config';
import type { AABB } from './map';
import { dot, sub, type Vec3 } from './vec';

export interface Sphere {
  center: Vec3;
  radius: number;
}

const EPS = 1e-6;

/**
 * Nearest intersection distance of a ray with a sphere, or null if it misses.
 * `dir` must be normalized. Returns 0 if the origin is inside the sphere.
 */
export function raySphere(origin: Vec3, dir: Vec3, sphere: Sphere): number | null {
  const m = sub(origin, sphere.center);
  const b = dot(m, dir);
  const c = dot(m, m) - sphere.radius * sphere.radius;

  // Origin outside the sphere (c > 0) and ray pointing away (b > 0): miss.
  if (c > 0 && b > 0) return null;

  const disc = b * b - c;
  if (disc < 0) return null; // ray misses the sphere

  const t = -b - Math.sqrt(disc);
  return t < 0 ? 0 : t; // negative => origin inside; treat as a point-blank hit
}

/**
 * Entry distance of a ray into an axis-aligned box (slab method), or null if it
 * misses. `dir` must be normalized. Returns 0 if the origin is inside the box.
 */
export function rayAABB(origin: Vec3, dir: Vec3, box: AABB): number | null {
  let tmin = 0;
  let tmax = Infinity;

  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const lo = [box.min.x, box.min.y, box.min.z];
  const hi = [box.max.x, box.max.y, box.max.z];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < EPS) {
      // Ray parallel to this slab: must start within it or there's no hit.
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (lo[i] - o[i]) * inv;
      let t2 = (hi[i] - o[i]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/** Distance to the nearest occluding obstacle along the ray, or Infinity. */
export function nearestObstacle(origin: Vec3, dir: Vec3, obstacles: AABB[]): number {
  let nearest = Infinity;
  for (const box of obstacles) {
    const t = rayAABB(origin, dir, box);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}

export interface HitResult {
  t: number; // distance along the ray to the hit
  headshot: boolean;
}

/** Body + head hurtbox spheres for a player standing at `feet`. */
export function hurtboxes(feet: Vec3): { body: Sphere; head: Sphere } {
  return {
    body: {
      center: { x: feet.x, y: feet.y + BODY_SPHERE.centerY, z: feet.z },
      radius: BODY_SPHERE.radius,
    },
    head: {
      center: { x: feet.x, y: feet.y + HEAD_SPHERE.centerY, z: feet.z },
      radius: HEAD_SPHERE.radius,
    },
  };
}

/**
 * Cast a ray against a target's hurtboxes, blocked by obstacles. Returns the hit
 * (nearest of body/head, with a headshot flag) or null if it misses, is out of
 * range, or is occluded by cover.
 */
export function hitscan(
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  target: { body: Sphere; head: Sphere },
  obstacles: AABB[],
): HitResult | null {
  const tBody = raySphere(origin, dir, target.body);
  const tHead = raySphere(origin, dir, target.head);

  let t: number | null = null;
  let headshot = false;
  if (tHead !== null && (tBody === null || tHead <= tBody)) {
    t = tHead;
    headshot = true;
  } else if (tBody !== null) {
    t = tBody;
  }

  if (t === null || t > maxDist) return null;
  if (nearestObstacle(origin, dir, obstacles) < t) return null; // blocked by cover

  return { t, headshot };
}
