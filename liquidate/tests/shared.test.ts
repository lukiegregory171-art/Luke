import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP,
  JUMP_PAD_SPEED,
  MAX_DT,
  PLAYER_RADIUS,
  add,
  clampDt,
  length,
  makeMoveState,
  normalize,
  onJumpPad,
  resolveCollisions,
  stepMovement,
  v3,
  type GameMap,
} from '@liquidate/shared';

const STEP = 1 / 60;
const FLAT: GameMap = {
  id: 'flat',
  name: 'Flat',
  width: 40,
  depth: 40,
  wallHeight: 4,
  obstacles: [],
  spawns: [
    { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
    { pos: { x: 0, y: 0, z: 1 }, yaw: 0 },
  ],
};
// A 2.5×2.5 crate, 1.4 tall, centred at origin.
const CRATE = { min: { x: -1.25, y: 0, z: -1.25 }, max: { x: 1.25, y: 1.4, z: 1.25 } };
const WITH_CRATE: GameMap = { ...FLAT, obstacles: [CRATE] };

describe('vec math', () => {
  it('adds vectors componentwise', () => {
    expect(add(v3(1, 2, 3), v3(4, 5, 6))).toEqual(v3(5, 7, 9));
  });

  it('normalizes to unit length', () => {
    expect(length(normalize(v3(0, 0, 5)))).toBeCloseTo(1);
  });

  it('normalizes a zero vector to zero (no NaN)', () => {
    expect(normalize(v3(0, 0, 0))).toEqual(v3(0, 0, 0));
  });
});

describe('clampDt (anti speed-hack)', () => {
  it('clamps dt above the max', () => {
    expect(clampDt(10)).toBe(MAX_DT);
  });

  it('rejects non-positive / non-finite dt', () => {
    expect(clampDt(0)).toBe(0);
    expect(clampDt(-1)).toBe(0);
    expect(clampDt(NaN)).toBe(0);
  });
});

describe('movement + collision', () => {
  it('accelerates the player forward over a few steps', () => {
    let state = makeMoveState(v3(0, 0, -5));
    // moveFwd toward +Z requires yaw = PI (forward = +Z) per our convention.
    for (let i = 0; i < 10; i++) {
      state = stepMovement(state, { moveFwd: 1, moveRight: 0, yaw: Math.PI }, 1 / 60, DEFAULT_MAP);
    }
    expect(state.pos.z).toBeGreaterThan(-5);
    expect(state.vel.z).toBeGreaterThan(0);
  });

  it('coasts to a stop via friction when input ceases', () => {
    let state = makeMoveState(v3(0, 0, 0));
    for (let i = 0; i < 10; i++) {
      state = stepMovement(state, { moveFwd: 1, moveRight: 0, yaw: Math.PI }, 1 / 60, DEFAULT_MAP);
    }
    const movingSpeed = Math.hypot(state.vel.x, state.vel.z);
    for (let i = 0; i < 30; i++) {
      state = stepMovement(state, { moveFwd: 0, moveRight: 0, yaw: Math.PI }, 1 / 60, DEFAULT_MAP);
    }
    expect(Math.hypot(state.vel.x, state.vel.z)).toBeLessThan(movingSpeed);
  });

  it('dashes faster than the normal max speed', () => {
    const dashed = stepMovement(
      makeMoveState(v3(0, 0, 0)),
      { moveFwd: 1, moveRight: 0, yaw: Math.PI, dash: true },
      1 / 60,
      DEFAULT_MAP,
    );
    expect(Math.hypot(dashed.vel.x, dashed.vel.z)).toBeGreaterThan(8.5); // > MOVE_SPEED
    expect(dashed.dashCd).toBeGreaterThan(0); // dash went on cooldown
  });

  it('keeps the player inside the arena bounds', () => {
    const halfW = DEFAULT_MAP.width / 2;
    const out = resolveCollisions(v3(1000, 0, 0), DEFAULT_MAP);
    expect(out.x).toBeLessThanOrEqual(halfW - PLAYER_RADIUS + 1e-6);
  });

  it('pushes the player out of an obstacle', () => {
    const firstBox = DEFAULT_MAP.obstacles[0];
    const center = v3(
      (firstBox.min.x + firstBox.max.x) / 2,
      0,
      (firstBox.min.z + firstBox.max.z) / 2,
    );
    const resolved = resolveCollisions(center, DEFAULT_MAP);
    // After resolution the player must not be strictly inside the box footprint.
    const insideX = resolved.x > firstBox.min.x && resolved.x < firstBox.max.x;
    const insideZ = resolved.z > firstBox.min.z && resolved.z < firstBox.max.z;
    expect(insideX && insideZ).toBe(false);
  });
});

describe('jump + gravity + vertical collision', () => {
  it('jumps off the ground and gravity returns it', () => {
    let s = makeMoveState(v3(5, 0, 0)); // away from any crate
    s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0, jump: true }, STEP, FLAT);
    expect(s.pos.y).toBeGreaterThan(0); // left the ground
    expect(s.vel.y).toBeGreaterThan(0); // rising

    let peak = s.pos.y;
    for (let i = 0; i < 120; i++) {
      s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, FLAT);
      peak = Math.max(peak, s.pos.y);
    }
    expect(peak).toBeGreaterThan(1.2); // clears a crate's height
    expect(s.pos.y).toBe(0); // ...and lands back on the floor
  });

  it('stays grounded under gravity when standing still', () => {
    let s = makeMoveState(v3(5, 0, 0));
    for (let i = 0; i < 30; i++) s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, FLAT);
    expect(s.pos.y).toBe(0);
    expect(s.vel.y).toBe(0);
  });

  it('lands on top of a crate instead of falling through', () => {
    let s = makeMoveState(v3(0, 3, 0)); // dropped above the crate
    for (let i = 0; i < 120; i++) s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, WITH_CRATE);
    expect(s.pos.y).toBeCloseTo(1.4, 2); // rests on the crate top
    expect(s.vel.y).toBe(0);
  });

  it('does not push you off a crate you are standing on, but blocks at ground level', () => {
    // Standing on top (feet at the crate top): not pushed horizontally.
    const onTop = resolveCollisions(v3(0, 1.4, 0), WITH_CRATE, 1.4);
    expect(onTop.x).toBe(0);
    expect(onTop.z).toBe(0);
    // At ground level the same crate ejects you out of its footprint.
    const atGround = resolveCollisions(v3(0, 0, 0), WITH_CRATE, 0);
    expect(Math.hypot(atGround.x, atGround.z)).toBeGreaterThan(1);
  });
});

describe('jetpack ability', () => {
  it('thrusting in the air rises (or arrests a fall) and drains fuel', () => {
    // Jump, then hold thrust: vertical velocity trends up while fuel lasts.
    let s = makeMoveState(v3(5, 0, 0));
    s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0, jump: true }, STEP, FLAT);
    const fuelAtLaunch = s.fuel;
    let peak = s.pos.y;
    for (let i = 0; i < 40; i++) {
      s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0, thrust: true }, STEP, FLAT);
      peak = Math.max(peak, s.pos.y);
    }
    expect(peak).toBeGreaterThan(2); // jetpack carries you higher than a plain jump (~1.7)
    expect(s.fuel).toBeLessThan(fuelAtLaunch); // ...and it costs fuel
  });

  it('cannot thrust with an empty tank', () => {
    let s = { ...makeMoveState(v3(5, 0, 0)), fuel: 0 };
    s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0, jump: true }, STEP, FLAT);
    const yAfterJump = s.pos.y;
    // Hold thrust with no fuel: it falls back like a normal jump (no lift).
    let peak = yAfterJump;
    for (let i = 0; i < 60; i++) {
      s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0, thrust: true }, STEP, FLAT);
      peak = Math.max(peak, s.pos.y);
    }
    expect(peak).toBeLessThan(2); // no jetpack lift
    expect(s.pos.y).toBe(0); // lands
  });

  it('recharges fuel on the ground', () => {
    let s = { ...makeMoveState(v3(5, 0, 0)), fuel: 0.2 };
    for (let i = 0; i < 60; i++) s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, FLAT);
    expect(s.fuel).toBeGreaterThan(0.2);
  });
});

describe('jump pads (shared movement)', () => {
  const PAD: GameMap = { ...FLAT, jumpPads: [{ x: 0, z: 0, r: 1.5 }] };

  it('detects a player standing within a pad footprint', () => {
    expect(onJumpPad(0, 0, PAD)).toBe(true);
    expect(onJumpPad(1.0, 0, PAD)).toBe(true);
    expect(onJumpPad(3, 0, PAD)).toBe(false); // outside the pad
    expect(onJumpPad(0, 0, FLAT)).toBe(false); // no pads on this map
  });

  it('launches a grounded player off a pad (far higher than a normal jump)', () => {
    let s = makeMoveState(v3(0, 0, 0)); // standing on the pad
    s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, PAD);
    expect(s.vel.y).toBeCloseTo(JUMP_PAD_SPEED, 1); // launched, no input needed

    let peak = 0;
    for (let i = 0; i < 90; i++) {
      s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, PAD);
      peak = Math.max(peak, s.pos.y);
    }
    expect(peak).toBeGreaterThan(2.6); // clears the catwalk height
  });

  it('does not launch a player who is not over a pad', () => {
    let s = makeMoveState(v3(5, 0, 0)); // off the pad
    for (let i = 0; i < 5; i++) {
      s = stepMovement(s, { moveFwd: 0, moveRight: 0, yaw: 0 }, STEP, PAD);
    }
    expect(s.pos.y).toBe(0); // stays grounded
    expect(s.vel.y).toBeLessThanOrEqual(0);
  });
});
