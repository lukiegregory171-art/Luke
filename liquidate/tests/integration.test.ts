/**
 * Headless integration test: boots the REAL server as a child process and drives
 * two scripted WebSocket clients through a full match over real sockets.
 *
 * Covers the M2 acceptance: matchmaking, movement (with server acks), an occluded
 * shot blocked by cover, headshots, a kill, respawn, a second kill, and the
 * server-declared winner — plus forfeit-on-disconnect.
 *
 * Fast via env overrides (TARGET_KILLS, RESPAWN_DELAY). The spawned server is
 * always killed on exit.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import {
  EYE_HEIGHT,
  HEAD_SPHERE,
  PITCH_LIMIT,
  STARTING_BALANCE,
  aimAngles,
  decode,
  rakeOf,
  sub,
  type AccountMessage,
  type GameMap,
  type HitEvent,
  type OverMessage,
  type PlayerSnapshot,
  type ServerMessage,
  type StartMessage,
  type Vec3,
} from '@liquidate/shared';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX = fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url));
const ENTRY = fileURLToPath(new URL('../server/src/index.ts', import.meta.url));
const PORT = 30000 + Math.floor(Math.random() * 2000);
const URL_WS = `ws://127.0.0.1:${PORT}/ws`;
const DT = 1 / 60;

let server: ChildProcess;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  id = '';
  seq = 0;
  private waiters: {
    pred: () => boolean;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  constructor() {
    this.ws = new WebSocket(URL_WS);
    this.ws.on('message', (raw) => {
      const msg = decode<ServerMessage>(raw.toString());
      this.messages.push(msg);
      if (msg.type === 'init') this.id = msg.id;
      for (const w of [...this.waiters]) {
        if (w.pred()) {
          clearTimeout(w.timer);
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve();
        }
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  input(opts: { moveFwd?: number; moveRight?: number; yaw?: number; pitch?: number }): void {
    this.seq++;
    this.send({
      type: 'input',
      seq: this.seq,
      dt: DT,
      moveFwd: opts.moveFwd ?? 0,
      moveRight: opts.moveRight ?? 0,
      yaw: opts.yaw ?? 0,
      pitch: opts.pitch ?? 0,
    });
  }

  fire(): void {
    this.send({ type: 'fire', seq: this.seq });
  }

  of<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  count(type: ServerMessage['type']): number {
    return this.messages.filter((m) => m.type === type).length;
  }

  /** Latest authoritative snapshot of a given player id. */
  snapOf(id: string): PlayerSnapshot | undefined {
    const snaps = this.of('snap');
    for (let i = snaps.length - 1; i >= 0; i--) {
      const p = snaps[i].players.find((pl) => pl.id === id);
      if (p) return p;
    }
    return undefined;
  }

  lastAck(id: string): number {
    const snaps = this.of('snap');
    return snaps.length ? (snaps[snaps.length - 1].ack[id] ?? 0) : 0;
  }

  waitUntil(pred: () => boolean, timeout = 6000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error('waitUntil timed out'));
      }, timeout);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  lastAccount(): AccountMessage | undefined {
    const a = this.of('account');
    return a.length ? a[a.length - 1] : undefined;
  }

  lastTreasury(): number {
    const t = this.of('treasury');
    return t.length ? t[t.length - 1].balance : 0;
  }

  close(): void {
    this.ws.close();
  }
}

let handleSeq = 0;

async function login(c: TestClient, handle: string): Promise<void> {
  await c.open();
  await c.waitUntil(() => c.id !== '');
  c.send({ type: 'login', handle });
  await c.waitUntil(() => c.lastAccount() !== undefined);
}

async function connect(
  stake: number,
  handle = `p${++handleSeq}_${Date.now()}`,
): Promise<TestClient> {
  const c = new TestClient();
  await login(c, handle);
  c.send({ type: 'queue', stake });
  return c;
}

async function connectPair(stake = 0): Promise<{
  a: TestClient;
  b: TestClient;
  map: GameMap;
  shooter: TestClient;
  victim: TestClient;
}> {
  const a = await connect(stake);
  const b = await connect(stake);

  await a.waitUntil(() => a.count('start') > 0);
  await b.waitUntil(() => b.count('start') > 0);

  const aStart = a.of('start')[0] as StartMessage;
  const map = aStart.map;
  const shooter = aStart.selfSpawnIndex === 0 ? a : b;
  const victim = shooter === a ? b : a;
  return { a, b, map, shooter, victim };
}

beforeAll(async () => {
  server = spawn(TSX, [ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      TARGET_KILLS: '2',
      RESPAWN_DELAY: '0.2',
      MAP: 'crossfire',
      LIQUIDATE_DB: ':memory:',
      RECONNECT_GRACE_MS: '600',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout?.on('data', (d) => (log += d));
  server.stderr?.on('data', (d) => (log += d));

  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`server did not start:\n${log}`);
    await delay(150);
  }
}, 20000);

afterAll(() => {
  server?.kill('SIGKILL');
});

// Make sure a hard kill happens even if the suite throws.
process.on('exit', () => server?.kill('SIGKILL'));

describe('LIQUIDATE multiplayer (integration)', () => {
  const open: TestClient[] = [];
  afterEach(() => {
    for (const c of open) c.close();
    open.length = 0;
  });

  it('pairs two clients into a 1v1 and assigns opposite spawns', async () => {
    const { a, b } = await connectPair();
    open.push(a, b);

    const aStart = a.of('start')[0] as StartMessage;
    const bStart = b.of('start')[0] as StartMessage;
    expect(aStart.opponentId).toBe(b.id);
    expect(bStart.opponentId).toBe(a.id);
    expect([aStart.selfSpawnIndex, bStart.selfSpawnIndex].sort()).toEqual([0, 1]);
  });

  it('runs a full match: movement, occlusion, headshots, respawn, winner', async () => {
    const STAKE = 100;
    const { a, b, map, shooter, victim } = await connectPair(STAKE);
    open.push(a, b);

    // Stakes are escrowed at match start: both balances drop by the stake.
    await shooter.waitUntil(() => shooter.lastAccount()?.balance === STARTING_BALANCE - STAKE);
    await victim.waitUntil(() => victim.lastAccount()?.balance === STARTING_BALANCE - STAKE);

    const spawn0 = map.spawns[0].pos; // shooter spawn (-Z end)
    const victimFeet = map.spawns[1].pos; // victim stays at its spawn (+Z end)
    const victimHead: Vec3 = {
      x: victimFeet.x,
      y: victimFeet.y + HEAD_SPHERE.centerY,
      z: victimFeet.z,
    };

    // --- Occlusion: a straight shot from spawn is blocked by the central pillar.
    const eyeAtSpawn: Vec3 = { x: spawn0.x, y: spawn0.y + EYE_HEIGHT, z: spawn0.z };
    const blockedAim = aimAngles(sub(victimHead, eyeAtSpawn));
    const hitsBefore = shooter.count('hit');
    shooter.input({ yaw: blockedAim.yaw, pitch: blockedAim.pitch });
    shooter.fire();
    await delay(350);
    expect(shooter.count('fire')).toBeGreaterThan(0); // the shot happened
    expect(shooter.count('hit')).toBe(hitsBefore); // ...but cover blocked it
    expect(shooter.snapOf(victim.id)?.health).toBe(100); // victim untouched

    // --- Movement: strafe +X (yaw = -PI/2 makes "forward" point +X) for line of
    // sight. Inputs are PACED (like a real client) so the anti-cheat per-tick
    // movement budget doesn't clamp them.
    for (let i = 0; i < 300 && (shooter.snapOf(shooter.id)?.x ?? 0) < 5.5; i++) {
      shooter.input({ moveFwd: 1, yaw: -Math.PI / 2 });
      await delay(12);
    }
    await shooter.waitUntil(() => (shooter.snapOf(shooter.id)?.x ?? 0) > 4);
    expect(shooter.lastAck(shooter.id)).toBe(shooter.seq); // server acked our inputs

    // Helper: fire aimed headshots from the shooter's CURRENT position until the
    // victim is killed (fires are rate-limited server-side, so space them out).
    async function landKill(): Promise<void> {
      const killsBefore = shooter.count('kill');
      for (let shot = 0; shot < 6; shot++) {
        const self = shooter.snapOf(shooter.id)!;
        const eye: Vec3 = { x: self.x, y: self.y + EYE_HEIGHT, z: self.z };
        const v = shooter.snapOf(victim.id)!;
        const head: Vec3 = { x: v.x, y: v.y + HEAD_SPHERE.centerY, z: v.z };
        const aim = aimAngles(sub(head, eye));
        shooter.input({ yaw: aim.yaw, pitch: aim.pitch });
        shooter.fire();
        await delay(150);
        if (shooter.count('kill') > killsBefore) return;
      }
      throw new Error('failed to land a kill');
    }

    // --- First kill (headshots land now that the pillar is out of the way).
    await landKill();
    expect(shooter.count('kill')).toBe(1);
    const headshots = shooter.of('hit').filter((h: HitEvent) => h.headshot);
    expect(headshots.length).toBeGreaterThan(0);

    // --- Respawn: the victim comes back at its own spawn.
    await shooter.waitUntil(() => shooter.of('respawn').some((r) => r.id === victim.id));
    await shooter.waitUntil(() => shooter.snapOf(victim.id)?.alive === true);
    const respawned = shooter.snapOf(victim.id)!;
    expect(Math.abs(respawned.z - victimFeet.z)).toBeLessThan(1);

    // --- Second kill ends the match (TARGET_KILLS = 2).
    await landKill();
    expect(shooter.count('kill')).toBe(2);

    await shooter.waitUntil(() => shooter.count('over') > 0);
    await victim.waitUntil(() => victim.count('over') > 0);
    const over = shooter.of('over')[0] as OverMessage;
    expect(over.winner).toBe(shooter.id);
    expect(over.scores[shooter.id]).toBe(2);

    // --- Economy: pot = 2*stake, 1% rake, winner credited net, loser debited.
    const pot = STAKE * 2;
    const rake = rakeOf(pot);
    expect(over.pot).toBe(pot);
    expect(over.rake).toBe(rake);
    await shooter.waitUntil(
      () => shooter.lastAccount()?.balance === STARTING_BALANCE - STAKE + (pot - rake),
    );
    await victim.waitUntil(() => victim.lastAccount()?.balance === STARTING_BALANCE - STAKE);
    await shooter.waitUntil(() => shooter.lastTreasury() === rake);
    // Conservation: winner gain + loser loss + treasury rake == 0.
    const winnerNet = shooter.lastAccount()!.balance - STARTING_BALANCE;
    const loserNet = victim.lastAccount()!.balance - STARTING_BALANCE;
    expect(winnerNet + loserNet + shooter.lastTreasury()).toBe(0);
  });

  it('grants a reconnection grace before forfeiting on disconnect', async () => {
    const { a, b } = await connectPair();
    open.push(a);

    b.close(); // opponent drops
    await delay(200); // less than the 600ms grace
    expect(a.count('over')).toBe(0); // not forfeited yet — grace window

    await a.waitUntil(() => a.count('over') > 0, 3000); // ...forfeits after grace
    expect(a.count('oppLeft')).toBeGreaterThan(0);
    const over = a.of('over')[0] as OverMessage;
    expect(over.winner).toBe(a.id);
  });

  it('resumes the match when a dropped player reconnects within grace', async () => {
    const handle = `recon_${Date.now()}`;
    const a = await connect(0);
    const b = await connect(0, handle);
    open.push(a);
    await a.waitUntil(() => a.count('start') > 0);
    await b.waitUntil(() => b.count('start') > 0);

    b.close(); // drop
    await delay(150); // within grace

    // Reconnect with the same handle/account.
    const b2 = new TestClient();
    open.push(b2);
    await login(b2, handle);
    await b2.waitUntil(() => b2.count('start') > 0); // resumed into the match
    await delay(250);
    expect(a.count('over')).toBe(0); // no forfeit — the match continued
  });

  it('bounds movement from flooded inputs (anti speed-hack)', async () => {
    const { a, b, shooter } = await connectPair(0);
    open.push(a, b);
    // Fire 400 inputs in one burst at the max dt; without the per-tick budget
    // this would cross the whole arena.
    for (let i = 0; i < 400; i++) {
      shooter.seq++;
      shooter.send({
        type: 'input',
        seq: shooter.seq,
        dt: 0.05,
        moveFwd: 1,
        moveRight: 0,
        yaw: -Math.PI / 2,
        pitch: 0,
      });
    }
    await delay(250);
    expect(shooter.snapOf(shooter.id)!.x).toBeLessThan(3); // movement was bounded
  });

  it('clamps impossible view angles', async () => {
    const { a, b, shooter } = await connectPair(0);
    open.push(a, b);
    shooter.input({ yaw: 0, pitch: 999 });
    await delay(150);
    expect(Math.abs(shooter.snapOf(shooter.id)!.pitch)).toBeLessThanOrEqual(PITCH_LIMIT + 1e-6);
  });
});
