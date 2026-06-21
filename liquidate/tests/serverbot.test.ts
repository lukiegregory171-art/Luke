/**
 * The server bot is a normal authoritative player: given snapshots it emits the
 * SAME input/fire messages a human sends (the Room validates them — it can't fake
 * a hit). This checks the brain deterministically: it aims at the opponent and
 * fires when on target + has line of sight, moves toward its hold range, and goes
 * idle when dead or when there's no live target.
 */

import { describe, expect, it } from 'vitest';
import type { ClientMessage, GameMap, PlayerSnapshot, ServerMessage } from '@liquidate/shared';
import { ServerBot } from '../server/src/serverbot';

const FLAT: GameMap = {
  id: 'flat',
  name: 'Flat',
  width: 30,
  depth: 40,
  wallHeight: 4,
  obstacles: [], // clear line of sight
  spawns: [
    { pos: { x: 0, y: 0, z: -10 }, yaw: Math.PI }, // bot, facing +Z
    { pos: { x: 0, y: 0, z: 10 }, yaw: 0 }, // human
  ],
};

function snapshot(id: string, x: number, z: number, over: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id,
    x,
    y: 0,
    z,
    vx: 0,
    vz: 0,
    dashCd: 0,
    yaw: 0,
    pitch: 0,
    health: 100,
    ammo: 30,
    weapon: 'assault',
    reloading: false,
    alive: true,
    score: 0,
    ...over,
  };
}

function harness(difficulty = 1) {
  const routed: ClientMessage[] = [];
  const bot = new ServerBot('B', difficulty);
  bot.attach((m) => routed.push(m));
  const start: ServerMessage = {
    type: 'start',
    mode: 'duel',
    opponentId: 'H',
    players: ['B', 'H'],
    names: { B: 'BOT', H: 'H' },
    teams: { B: 0, H: 0 },
    selfSpawnIndex: 0,
    map: FLAT,
    stake: 0,
  };
  bot.onMessage(start);
  const snap = (players: PlayerSnapshot[]): void =>
    bot.onMessage({ type: 'snap', tick: 1, serverTime: Date.now(), ack: {}, players });
  return { bot, routed, snap };
}

describe('ServerBot (M3 bots-fill)', () => {
  it('emits a legal input aimed at the opponent, and fires with a clear shot', () => {
    const { routed, snap } = harness();
    // Bot at z=-10 facing +Z; opponent straight ahead at z=+10.
    for (let i = 0; i < 3; i++) snap([snapshot('B', 0, -10), snapshot('H', 0, 10)]);

    const inputs = routed.filter((m) => m.type === 'input') as Extract<
      ClientMessage,
      { type: 'input' }
    >[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const inp of inputs) {
      expect(Number.isFinite(inp.yaw)).toBe(true);
      expect(Number.isFinite(inp.pitch)).toBe(true);
      expect(inp.moveFwd).toBeGreaterThanOrEqual(-1);
      expect(inp.moveFwd).toBeLessThanOrEqual(1);
      expect(inp.dt).toBeGreaterThan(0);
    }
    // It is already facing the target on a flat map → it shoots.
    expect(routed.some((m) => m.type === 'fire')).toBe(true);
  });

  it('holds still and does not fire when it is dead', () => {
    const { routed, snap } = harness();
    snap([snapshot('B', 0, -10, { alive: false }), snapshot('H', 0, 10)]);
    const inputs = routed.filter((m) => m.type === 'input') as Extract<
      ClientMessage,
      { type: 'input' }
    >[];
    expect(inputs.length).toBe(1);
    expect(inputs[0].moveFwd).toBe(0);
    expect(inputs[0].moveRight).toBe(0);
    expect(routed.some((m) => m.type === 'fire')).toBe(false);
  });

  it('does not fire at a dead opponent', () => {
    const { routed, snap } = harness();
    snap([snapshot('B', 0, -10), snapshot('H', 0, 10, { alive: false })]);
    expect(routed.some((m) => m.type === 'fire')).toBe(false);
  });

  it('does not fire while reloading or out of ammo', () => {
    const { routed, snap } = harness();
    snap([snapshot('B', 0, -10, { ammo: 0, reloading: true }), snapshot('H', 0, 10)]);
    expect(routed.some((m) => m.type === 'fire')).toBe(false);
  });
});
