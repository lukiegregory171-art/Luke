/**
 * Minimal pure vector math shared by client (prediction) and server (authority).
 * Positions are 3D; most movement/collision math runs on the horizontal X/Z plane
 * with Y reserved for height (eye height, head/body spheres).
 *
 * Everything here is a pure function returning new objects — no mutation — so the
 * same call produces identical results on both sides.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function clone(a: Vec3): Vec3 {
  return { x: a.x, y: a.y, z: a.z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: Vec3): number {
  return Math.sqrt(lengthSq(a));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Direction the player is looking, from yaw (around Y) and pitch (around X).
 * Convention: yaw = 0, pitch = 0 looks down -Z (the Three.js default forward).
 * Positive pitch looks up.
 */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

/** Horizontal forward unit vector for movement (ignores pitch). */
export function forwardFromYaw(yaw: number): Vec3 {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}

/** Horizontal right unit vector for strafing. */
export function rightFromYaw(yaw: number): Vec3 {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/** Perturb a unit direction within a random cone of the given half-angle. */
export function perturbDirection(dir: Vec3, spread: number): Vec3 {
  if (spread <= 0) return { x: dir.x, y: dir.y, z: dir.z };
  const ref: Vec3 = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(dir, ref));
  const up = normalize(cross(right, dir));
  const angle = Math.random() * Math.PI * 2;
  const radius = spread * Math.sqrt(Math.random());
  const ca = Math.cos(angle) * radius;
  const sa = Math.sin(angle) * radius;
  return normalize({
    x: dir.x + right.x * ca + up.x * sa,
    y: dir.y + right.y * ca + up.y * sa,
    z: dir.z + right.z * ca + up.z * sa,
  });
}

/** Inverse of {@link aimDirection}: yaw/pitch that look along `dir`. */
export function aimAngles(dir: Vec3): { yaw: number; pitch: number } {
  const len = length(dir);
  if (len < 1e-9) return { yaw: 0, pitch: 0 };
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  return {
    yaw: Math.atan2(-d.x, -d.z),
    pitch: Math.asin(clamp(d.y, -1, 1)),
  };
}
