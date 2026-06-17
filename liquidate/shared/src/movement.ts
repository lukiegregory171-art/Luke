/**
 * Movement + collision. THIS IS THE SINGLE SOURCE OF TRUTH for how a player
 * moves through the world. The client calls it for prediction and the server
 * calls it for authority — never reimplement this math anywhere else, or
 * prediction and the server will drift apart.
 *
 * The player is modelled as a vertical cylinder (a circle of PLAYER_RADIUS on
 * the X/Z plane). Obstacles and arena bounds are axis-aligned boxes, so
 * collision resolution is circle-vs-AABB closest-point pushout.
 */

import {
  DASH_COOLDOWN,
  DASH_SPEED,
  GROUND_ACCEL,
  GROUND_FRICTION,
  MAX_DT,
  MOVE_SPEED,
  PLAYER_RADIUS,
  STOP_SPEED,
} from './config';
import type { AABB, GameMap } from './map';
import { clamp, forwardFromYaw, normalize, rightFromYaw, type Vec3 } from './vec';

/** The movement-relevant slice of a player's input for one step. */
export interface MoveInput {
  moveFwd: number; // -1..1 (forward/back)
  moveRight: number; // -1..1 (strafe)
  yaw: number; // radians
  dash?: boolean; // edge-triggered dash request
}

/**
 * Full movement state. Velocity and the dash cooldown live here (not just
 * position) because the movement is acceleration/friction based — so the
 * server must include them in snapshots and the client must reconcile them.
 */
export interface MoveState {
  pos: Vec3;
  vel: Vec3; // horizontal velocity (y unused)
  dashCd: number; // seconds until dash is ready
}

/** A fresh, stationary movement state at the given feet position. */
export function makeMoveState(pos: Vec3): MoveState {
  return { pos: { x: pos.x, y: pos.y, z: pos.z }, vel: { x: 0, y: 0, z: 0 }, dashCd: 0 };
}

/** Clamp a client-supplied dt to the legal range (anti speed-hack). */
export function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, MAX_DT);
}

/** Sanitize an analog axis to [-1, 1]; non-finite becomes 0. */
function axis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return clamp(v, -1, 1);
}

/**
 * Advance one movement step: friction, acceleration toward the wished
 * direction (capped at MOVE_SPEED), an optional dash impulse, then integrate
 * and resolve collisions. Pure — returns a new MoveState.
 */
export function stepMovement(
  state: MoveState,
  input: MoveInput,
  dt: number,
  map: GameMap,
): MoveState {
  const cdt = clampDt(dt);
  if (cdt === 0) {
    return {
      pos: { x: state.pos.x, y: state.pos.y, z: state.pos.z },
      vel: { x: state.vel.x, y: 0, z: state.vel.z },
      dashCd: state.dashCd,
    };
  }

  const fwd = forwardFromYaw(input.yaw);
  const right = rightFromYaw(input.yaw);
  const mf = axis(input.moveFwd);
  const mr = axis(input.moveRight);
  const wish = normalize({
    x: fwd.x * mf + right.x * mr,
    y: 0,
    z: fwd.z * mf + right.z * mr,
  });
  const wishLen = Math.hypot(wish.x, wish.z); // 0 (idle) or 1

  const vel: Vec3 = { x: state.vel.x, y: 0, z: state.vel.z };

  // Friction.
  const speed = Math.hypot(vel.x, vel.z);
  if (speed > 0) {
    const control = speed < STOP_SPEED ? STOP_SPEED : speed;
    const newSpeed = Math.max(0, speed - control * GROUND_FRICTION * cdt);
    const scale = newSpeed / speed;
    vel.x *= scale;
    vel.z *= scale;
  }

  // Accelerate toward the wished direction, capped at MOVE_SPEED.
  if (wishLen > 0) {
    const current = vel.x * wish.x + vel.z * wish.z;
    const add = MOVE_SPEED - current;
    if (add > 0) {
      const accelSpeed = Math.min(GROUND_ACCEL * cdt * MOVE_SPEED, add);
      vel.x += wish.x * accelSpeed;
      vel.z += wish.z * accelSpeed;
    }
  }

  // Dash: a burst impulse along the wished (or facing) direction.
  let dashCd = Math.max(0, state.dashCd - cdt);
  if (input.dash && dashCd <= 0) {
    const d = wishLen > 0 ? wish : { x: fwd.x, y: 0, z: fwd.z };
    vel.x = d.x * DASH_SPEED;
    vel.z = d.z * DASH_SPEED;
    dashCd = DASH_COOLDOWN;
  }

  // Integrate and resolve collisions.
  const intended: Vec3 = {
    x: state.pos.x + vel.x * cdt,
    y: state.pos.y,
    z: state.pos.z + vel.z * cdt,
  };
  const resolved = resolveCollisions(intended, map);

  // If a wall pushed us back, recompute velocity from the actual displacement
  // so we don't accumulate speed into obstacles.
  if (Math.abs(resolved.x - intended.x) > 1e-6 || Math.abs(resolved.z - intended.z) > 1e-6) {
    vel.x = (resolved.x - state.pos.x) / cdt;
    vel.z = (resolved.z - state.pos.z) / cdt;
  }

  return { pos: resolved, vel, dashCd };
}

/**
 * Push a circle (player) out of the arena walls and every obstacle box.
 * Runs a couple of passes so resolving one box doesn't shove the player into
 * another.
 */
export function resolveCollisions(pos: Vec3, map: GameMap): Vec3 {
  let p: Vec3 = { x: pos.x, y: pos.y, z: pos.z };

  for (let pass = 0; pass < 2; pass++) {
    p = clampToArena(p, map);
    for (const box of map.obstacles) {
      p = pushOutOfBox(p, box);
    }
  }
  return p;
}

/** Keep the player's circle inside the arena bounds. */
export function clampToArena(pos: Vec3, map: GameMap): Vec3 {
  const halfW = map.width / 2 - PLAYER_RADIUS;
  const halfD = map.depth / 2 - PLAYER_RADIUS;
  return {
    x: clamp(pos.x, -halfW, halfW),
    y: pos.y,
    z: clamp(pos.z, -halfD, halfD),
  };
}

/**
 * Circle-vs-AABB resolution on the X/Z plane. If the player's circle overlaps
 * the box, push it out along the shortest axis (closest-point method, which
 * also handles the corner case correctly).
 */
function pushOutOfBox(pos: Vec3, box: AABB): Vec3 {
  // Closest point on the box (in X/Z) to the circle centre.
  const cx = clamp(pos.x, box.min.x, box.max.x);
  const cz = clamp(pos.z, box.min.z, box.max.z);

  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;

  if (distSq >= PLAYER_RADIUS * PLAYER_RADIUS) {
    return pos; // outside the inflated box — no overlap
  }

  if (distSq > 1e-12) {
    // Centre is outside the box but the circle clips a face/corner: push along
    // the vector from the closest point to the centre.
    const dist = Math.sqrt(distSq);
    const push = PLAYER_RADIUS - dist;
    return {
      x: pos.x + (dx / dist) * push,
      y: pos.y,
      z: pos.z + (dz / dist) * push,
    };
  }

  // Centre is inside the box: eject along the axis of least penetration.
  const toLeft = pos.x - box.min.x;
  const toRight = box.max.x - pos.x;
  const toBack = pos.z - box.min.z;
  const toFront = box.max.z - pos.z;
  const minPen = Math.min(toLeft, toRight, toBack, toFront);

  if (minPen === toLeft) return { x: box.min.x - PLAYER_RADIUS, y: pos.y, z: pos.z };
  if (minPen === toRight) return { x: box.max.x + PLAYER_RADIUS, y: pos.y, z: pos.z };
  if (minPen === toBack) return { x: pos.x, y: pos.y, z: box.min.z - PLAYER_RADIUS };
  return { x: pos.x, y: pos.y, z: box.max.z + PLAYER_RADIUS };
}
