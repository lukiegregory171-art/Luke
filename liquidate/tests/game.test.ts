/**
 * Exercises the client's solo game logic (firing, shared hitscan with occlusion,
 * ammo + reload) without a browser/WebGL, by driving the real Game class with
 * lightweight stubs for the world/input/weapon/dummy/HUD.
 */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP, RIFLE, hurtboxes, type GameMap, type Vec3 } from '@liquidate/shared';
import { Game } from '../client/src/game';
import type { World } from '../client/src/world';
import type { Input } from '../client/src/input';
import type { Weapon } from '../client/src/weapon';
import type { Dummy } from '../client/src/dummy';
import type { Hud } from '../client/src/hud';

function makeHarness(opts: { dummyFeet: Vec3; map?: GameMap; lethal?: boolean }) {
  const camera = {
    position: {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    },
    rotation: { set() {} },
  };
  const world = { camera } as unknown as World;
  const input = {
    yaw: 0,
    pitch: 0,
    firing: false,
    keys: new Set<string>(),
    onReload: () => {},
  } as unknown as Input;
  const weapon = { fire: vi.fn(), update: vi.fn() } as unknown as Weapon;
  const dummy = {
    alive: true,
    hurtboxes: () => hurtboxes(opts.dummyFeet),
    damage: vi.fn(() => opts.lethal ?? false),
    update: vi.fn(),
  } as unknown as Dummy;
  const hud = {
    setAmmo: vi.fn(),
    setScore: vi.fn(),
    setReloading: vi.fn(),
    hit: vi.fn(),
  } as unknown as Hud;

  const game = new Game(opts.map ?? DEFAULT_MAP, world, input, weapon, dummy, hud);
  return { game, input, weapon, dummy, hud };
}

// Player spawns at DEFAULT_MAP.spawns[0] = (0,0,-19) facing +Z.
const FRONT: Vec3 = { x: 0, y: 0, z: -5 }; // clear line of sight from spawn 0

describe('Game firing', () => {
  it('registers a headshot when aiming straight at the dummy', () => {
    const { game, input, weapon, dummy, hud } = makeHarness({ dummyFeet: FRONT });
    input.firing = true;
    input.pitch = 0; // eye height ~= head height => headshot

    game.update(0.02);

    expect(weapon.fire).toHaveBeenCalledTimes(1);
    expect(dummy.damage).toHaveBeenCalledTimes(1);
    expect(hud.hit).toHaveBeenCalledWith(true);
    expect(hud.setAmmo).toHaveBeenLastCalledWith(RIFLE.magazine - 1, RIFLE.magazine);
  });

  it('registers a body shot (not a headshot) when aiming lower', () => {
    const { game, input, weapon, hud } = makeHarness({ dummyFeet: FRONT });
    input.firing = true;
    input.pitch = -0.05; // tilt down into the torso

    game.update(0.02);

    expect(weapon.fire).toHaveBeenCalledTimes(1);
    expect(hud.hit).toHaveBeenCalledWith(false);
  });

  it('is blocked when the dummy is behind cover (central pillar)', () => {
    // Dummy on the far side of the origin pillar from spawn 0.
    const { game, input, weapon, dummy, hud } = makeHarness({ dummyFeet: { x: 0, y: 0, z: 8 } });
    input.firing = true;
    input.pitch = -0.022; // would hit the torso if not for the pillar

    game.update(0.02);

    expect(weapon.fire).toHaveBeenCalledTimes(1); // we still fire a tracer
    expect(dummy.damage).not.toHaveBeenCalled(); // but cover blocks the hit
    expect(hud.hit).not.toHaveBeenCalled();
  });

  it('increments the score when a shot is lethal', () => {
    const { game, input, hud } = makeHarness({ dummyFeet: FRONT, lethal: true });
    input.firing = true;

    game.update(0.02);

    expect(hud.setScore).toHaveBeenLastCalledWith(1);
  });
});

describe('Game ammo + reload', () => {
  it('empties the magazine then auto-reloads to full', () => {
    const { game, input, hud } = makeHarness({ dummyFeet: FRONT });
    input.firing = true;

    // Each tick advances past the fire interval, so one round leaves per tick.
    for (let i = 0; i < RIFLE.magazine; i++) {
      game.update(RIFLE.fireInterval + 0.001);
    }

    expect(hud.setAmmo).toHaveBeenLastCalledWith(0, RIFLE.magazine);
    expect(hud.setReloading).toHaveBeenLastCalledWith(true);

    // Stop firing and let the reload timer elapse.
    input.firing = false;
    game.update(RIFLE.reloadTime + 0.01);

    expect(hud.setReloading).toHaveBeenLastCalledWith(false);
    expect(hud.setAmmo).toHaveBeenLastCalledWith(RIFLE.magazine, RIFLE.magazine);
  });
});
