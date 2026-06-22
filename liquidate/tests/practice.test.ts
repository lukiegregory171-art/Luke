/**
 * Exercises the offline Practice controller's player-firing logic (shared
 * hitscan + ammo + reload) without a browser. We use a flat test map (clear
 * line of sight) and a passive bot so the player's shots are deterministic.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ASSAULT, type GameMap } from '@liquidate/shared';
import { Practice } from '../client/src/practice';
import { Impacts } from '../client/src/impacts';
import { Shake } from '../client/src/shake';
import type { World } from '../client/src/world';
import type { Input } from '../client/src/input';
import type { Weapon } from '../client/src/weapon';
import type { Hud } from '../client/src/hud';
import type { Sfx } from '../client/src/audio';

// A flat arena with the two players in clear sight of each other.
const FLAT: GameMap = {
  id: 'flat',
  name: 'Flat',
  width: 30,
  depth: 40,
  wallHeight: 4,
  obstacles: [],
  spawns: [
    { pos: { x: 0, y: 0, z: -10 }, yaw: Math.PI }, // player, facing +Z
    { pos: { x: 0, y: 0, z: 10 }, yaw: 0 }, // bot
  ],
};

function harness() {
  const camera = { position: { set() {} }, rotation: { set() {} } };
  const world = { scene: new THREE.Scene(), camera } as unknown as World;
  const input = {
    yaw: 0,
    pitch: 0,
    firing: false,
    locked: true,
    keys: new Set<string>(),
    onReload: () => {},
    onSwitch: () => {},
    consumeDash: () => false,
    consumeJump: () => false,
  } as unknown as Input;
  const gun = {
    fire: vi.fn(),
    fireMany: vi.fn(),
    update: vi.fn(),
    setWeapon: vi.fn(),
    setReloading: vi.fn(),
  } as unknown as Weapon;
  const hud = {
    setScores: vi.fn(),
    setHealth: vi.fn(),
    setAmmo: vi.fn(),
    setWeapon: vi.fn(),
    setReloading: vi.fn(),
    hit: vi.fn(),
    addKill: vi.fn(),
    banner: vi.fn(),
    damageFlash: vi.fn(),
    damageFrom: vi.fn(),
    crosshairKick: vi.fn(),
    damageNumber: vi.fn(),
    setFuel: vi.fn(),
    announce: vi.fn(),
  } as unknown as Hud;
  const sfx = {
    shoot: vi.fn(),
    hit: vi.fn(),
    reload: vi.fn(),
    dash: vi.fn(),
    kill: vi.fn(),
    death: vi.fn(),
    footsteps: vi.fn(),
    jump: vi.fn(),
    thrustOn: vi.fn(),
    multiKill: vi.fn(),
  } as unknown as Sfx;

  const impacts = new Impacts(world.scene);
  const shake = new Shake();
  const practice = new Practice(FLAT, world, input, gun, hud, sfx, impacts, shake);
  practice.bot.passive = true; // bot won't move or shoot back
  return { practice, input, gun, hud };
}

describe('Practice (offline vs bot)', () => {
  it('lands a hit on the bot with a clear shot', () => {
    const { practice, input, gun, hud } = harness();
    input.firing = true;
    input.pitch = 0; // eye-height aim -> head

    const before = practice.bot.health;
    practice.update(0.02);

    expect(gun.fire).toHaveBeenCalledTimes(1);
    expect(hud.hit).toHaveBeenCalled();
    expect(practice.bot.health).toBeLessThan(before);
    expect(hud.setAmmo).toHaveBeenLastCalledWith(ASSAULT.magazine - 1, ASSAULT.magazine);
  });

  it('empties the magazine then auto-reloads to full', () => {
    const { practice, input, hud } = harness();
    input.firing = true;
    // Keep the bot alive so firing continues (aim just over its head).
    input.pitch = 0.6;

    for (let i = 0; i < ASSAULT.magazine; i++) practice.update(ASSAULT.fireInterval + 0.001);
    expect(hud.setAmmo).toHaveBeenLastCalledWith(0, ASSAULT.magazine);
    expect(hud.setReloading).toHaveBeenLastCalledWith(true);

    input.firing = false;
    practice.update(ASSAULT.reloadTime + 0.01);
    expect(hud.setReloading).toHaveBeenLastCalledWith(false);
    expect(hud.setAmmo).toHaveBeenLastCalledWith(ASSAULT.magazine, ASSAULT.magazine);
  });
});
