// Deterministic character-movement simulation. This exact function runs on the
// server (authoritative) and on the client (local prediction) so that replaying
// buffered inputs after a server correction converges instead of diverging.

import {
  GRAVITY,
  WALK_SPEED,
  SPRINT_SPEED,
  AIR_CONTROL,
  JUMP_SPEED,
  DOUBLE_JUMP_SPEED,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  GROUND_FRICTION,
  AIR_FRICTION,
  PLAYER_RADIUS,
} from './constants.js';

const STEP_TOLERANCE = 0.05;

export function createMovementState(x, y, z, yaw = 0) {
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    yaw,
    grounded: true,
    jumpsUsed: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirZ: 0,
  };
}

function surfaceTopAt(c, x, z) {
  if (!c.ramp) return c.maxY;
  const { axis, dir } = c.ramp;
  let t;
  if (axis === 'z') {
    const cz = Math.min(Math.max(z, c.minZ), c.maxZ);
    t = (cz - c.minZ) / (c.maxZ - c.minZ);
  } else {
    const cx = Math.min(Math.max(x, c.minX), c.maxX);
    t = (cx - c.minX) / (c.maxX - c.minX);
  }
  if (dir === -1) t = 1 - t;
  return c.minY + t * (c.maxY - c.minY);
}

function blocksAt(c, x, z, footY) {
  if (c.ramp) return false; // ramps are always walkable, never a horizontal wall
  if (x < c.minX - PLAYER_RADIUS || x > c.maxX + PLAYER_RADIUS) return false;
  if (z < c.minZ - PLAYER_RADIUS || z > c.maxZ + PLAYER_RADIUS) return false;
  return footY < c.maxY - STEP_TOLERANCE;
}

function collidesHorizontal(x, z, footY, colliders) {
  for (const c of colliders) {
    if (blocksAt(c, x, z, footY)) return true;
  }
  return false;
}

function getGroundHeight(x, z, colliders) {
  let best = 0;
  for (const c of colliders) {
    if (x < c.minX - PLAYER_RADIUS || x > c.maxX + PLAYER_RADIUS) continue;
    if (z < c.minZ - PLAYER_RADIUS || z > c.maxZ + PLAYER_RADIUS) continue;
    const top = surfaceTopAt(c, x, z);
    if (top > best) best = top;
  }
  return best;
}

function clampToArena(s, halfSize) {
  const lim = halfSize - 0.5;
  s.x = Math.min(Math.max(s.x, -lim), lim);
  s.z = Math.min(Math.max(s.z, -lim), lim);
}

// input: { forward, back, left, right, sprint, jump, dash } (bools), yaw (radians)
export function simulateMovementTick(state, input, dt, colliders, halfSize = 46) {
  const s = { ...state, yaw: input.yaw };

  let moveX = 0;
  let moveZ = 0;
  if (input.forward) { moveX += Math.sin(s.yaw); moveZ += Math.cos(s.yaw); }
  if (input.back) { moveX -= Math.sin(s.yaw); moveZ -= Math.cos(s.yaw); }
  if (input.right) { moveX += Math.cos(s.yaw); moveZ -= Math.sin(s.yaw); }
  if (input.left) { moveX -= Math.cos(s.yaw); moveZ += Math.sin(s.yaw); }
  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen > 0.0001) { moveX /= moveLen; moveZ /= moveLen; }

  if (s.dashCooldown > 0) s.dashCooldown = Math.max(0, s.dashCooldown - dt);

  if (input.dash && s.dashCooldown <= 0 && s.dashTimer <= 0) {
    const hasDir = moveLen > 0.0001;
    s.dashDirX = hasDir ? moveX : Math.sin(s.yaw);
    s.dashDirZ = hasDir ? moveZ : Math.cos(s.yaw);
    s.dashTimer = DASH_DURATION;
    s.dashCooldown = DASH_COOLDOWN;
  }

  if (s.dashTimer > 0) {
    s.vx = s.dashDirX * DASH_SPEED;
    s.vz = s.dashDirZ * DASH_SPEED;
    s.dashTimer = Math.max(0, s.dashTimer - dt);
  } else {
    const wishSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const targetVX = moveX * wishSpeed;
    const targetVZ = moveZ * wishSpeed;
    const accel = s.grounded ? GROUND_FRICTION : AIR_FRICTION * AIR_CONTROL;
    const lerp = Math.min(1, accel * dt);
    s.vx += (targetVX - s.vx) * lerp;
    s.vz += (targetVZ - s.vz) * lerp;
  }

  if (input.jump) {
    if (s.grounded) {
      s.vy = JUMP_SPEED;
      s.grounded = false;
      s.jumpsUsed = 1;
    } else if (s.jumpsUsed < 2) {
      s.vy = DOUBLE_JUMP_SPEED;
      s.jumpsUsed = 2;
    }
  }

  s.vy -= GRAVITY * dt;

  const prevFootY = s.y;

  const newX = s.x + s.vx * dt;
  if (!collidesHorizontal(newX, s.z, prevFootY, colliders)) {
    s.x = newX;
  } else {
    s.vx = 0;
  }

  const newZ = s.z + s.vz * dt;
  if (!collidesHorizontal(s.x, newZ, prevFootY, colliders)) {
    s.z = newZ;
  } else {
    s.vz = 0;
  }

  s.y += s.vy * dt;

  const ground = getGroundHeight(s.x, s.z, colliders);
  if (s.y <= ground) {
    s.y = ground;
    s.vy = 0;
    s.grounded = true;
    s.jumpsUsed = 0;
  } else {
    s.grounded = false;
  }

  clampToArena(s, halfSize);

  return s;
}
