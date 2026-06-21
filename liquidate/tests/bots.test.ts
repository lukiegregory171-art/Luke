/**
 * Headless test for "bots fill empty lobbies" (M3). Boots the real server with a
 * short bot-fill delay, queues a SINGLE client, and asserts it gets matched
 * against a server-side bot that actually plays — i.e. the lobby is never empty
 * and the bot is a live, server-driven opponent (it moves on its own).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  decode,
  type OverMessage,
  type PlayerSnapshot,
  type ServerMessage,
  type StartMessage,
} from '@liquidate/shared';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
const ENTRY = fileURLToPath(new URL('../server/src/index.ts', import.meta.url));
const PORT = 32000 + Math.floor(Math.random() * 2000);
const URL_WS = `ws://127.0.0.1:${PORT}/ws`;

let server: ChildProcess;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class Client {
  readonly ws = new WebSocket(URL_WS);
  readonly messages: ServerMessage[] = [];
  id = '';
  constructor() {
    this.ws.on('message', (raw) => {
      const msg = decode<ServerMessage>(raw.toString());
      this.messages.push(msg);
      if (msg.type === 'init') this.id = msg.id;
    });
  }
  open(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }
  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }
  of<T extends ServerMessage['type']>(t: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === t);
  }
  snapsOf(id: string): PlayerSnapshot[] {
    const out: PlayerSnapshot[] = [];
    for (const s of this.of('snap')) {
      const p = s.players.find((pl) => pl.id === id);
      if (p) out.push(p);
    }
    return out;
  }
  async waitUntil(pred: () => boolean, timeout = 5000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!pred()) {
      if (Date.now() > deadline) throw new Error('waitUntil timed out');
      await delay(25);
    }
  }
  close(): void {
    this.ws.close();
  }
}

beforeAll(async () => {
  server = spawn(TSX, [ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      BOT_FILL_MS: '300', // fill fast for the test
      TARGET_KILLS: '10', // duel: don't let the match end during observation
      FFA_TARGET_KILLS: '2', // ffa: end quickly once bots frag each other
      TDM_TARGET_KILLS: '3', // tdm: end quickly once a team frags enough
      RESPAWN_DELAY: '0.3',
      MAP: 'crossfire',
      LIQUIDATE_DB: ':memory:',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout?.on('data', (d) => (logs += d));
  server.stderr?.on('data', (d) => (logs += d));
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`server did not start:\n${logs}`);
    await delay(150);
  }
}, 20000);

afterAll(() => server?.kill('SIGKILL'));
process.on('exit', () => server?.kill('SIGKILL'));

describe('bots fill empty lobbies (M3)', () => {
  it('matches a lone player against a server-driven bot that plays', async () => {
    const c = new Client();
    await c.open();
    await c.waitUntil(() => c.id !== '');
    c.send({ type: 'login', handle: `solo_${Date.now()}` });
    await c.waitUntil(() => c.of('account').length > 0);
    c.send({ type: 'queue', stake: 0 });

    // Bot-fill: a 'start' arrives even though no human is available.
    await c.waitUntil(() => c.of('start').length > 0);
    const start = c.of('start')[0] as StartMessage;
    expect(start.opponentId).toMatch(/^bot-/); // the opponent is a server bot

    // The bot is a live, server-driven opponent: it moves on its own.
    await c.waitUntil(() => c.snapsOf(start.opponentId).length > 3);
    const first = c.snapsOf(start.opponentId)[0];
    await delay(1300);
    const botSnaps = c.snapsOf(start.opponentId);
    const moved = botSnaps.some(
      (s) => Math.hypot(s.x - first.x, s.z - first.z) > 0.5,
    );
    expect(moved).toBe(true);
    expect(botSnaps[botSnaps.length - 1].alive).toBe(true);

    c.close();
  });

  it('fills a free-for-all with bots and plays to a winner', async () => {
    const c = new Client();
    await c.open();
    await c.waitUntil(() => c.id !== '');
    c.send({ type: 'login', handle: `ffa_${Date.now()}` });
    await c.waitUntil(() => c.of('account').length > 0);
    c.send({ type: 'queue', stake: 0, mode: 'ffa' });

    await c.waitUntil(() => c.of('start').length > 0);
    const start = c.of('start')[0] as StartMessage;
    expect(start.mode).toBe('ffa');
    expect(start.players.length).toBe(6); // 1 human + 5 bots

    // The room simulates all 6 players authoritatively.
    await c.waitUntil(() => (c.of('snap').at(-1)?.players.length ?? 0) === 6);

    // Bots fight each other; someone reaches the FFA target → server declares a
    // winner (one of the players in the match).
    await c.waitUntil(() => c.of('over').length > 0, 15000);
    const over = c.of('over')[0] as OverMessage;
    expect(start.players).toContain(over.winner);

    c.close();
  });

  it('fills a team deathmatch (3v3) and plays to a team win', async () => {
    const c = new Client();
    await c.open();
    await c.waitUntil(() => c.id !== '');
    c.send({ type: 'login', handle: `tdm_${Date.now()}` });
    await c.waitUntil(() => c.of('account').length > 0);
    c.send({ type: 'queue', stake: 0, mode: 'tdm' });

    await c.waitUntil(() => c.of('start').length > 0);
    const start = c.of('start')[0] as StartMessage;
    expect(start.mode).toBe('tdm');
    expect(start.players.length).toBe(6);
    // Balanced teams: 3 per side.
    const counts = [0, 0];
    for (const id of start.players) counts[start.teams[id]]++;
    expect(counts).toEqual([3, 3]);

    // A team reaches the frag target → server declares the winning TEAM.
    await c.waitUntil(() => c.of('over').length > 0, 15000);
    const over = c.of('over')[0] as OverMessage;
    expect(over.winnerTeam === 0 || over.winnerTeam === 1).toBe(true);

    c.close();
  });
});
