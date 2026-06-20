/**
 * Server-side bot brain. A bot occupies a real player slot in a {@link Room} and
 * is driven ENTIRELY by the authoritative snapshots it receives: on each `snap`
 * it reads its own + the opponent's server position, aims (slewed, with a little
 * jitter so it's beatable), holds mid-range while strafing, and fires when it has
 * line of sight — by sending the SAME `input`/`fire` messages a human client
 * sends. The Room validates them like anyone else, so a bot can't fake a hit,
 * move illegally, or alter an outcome. Being snapshot-driven, it naturally goes
 * idle when the match pauses (no snapshots arrive).
 *
 * Used to fill empty lobbies so the game is never empty. Bot matches are free
 * (no stake/economy — see the matchmaker), and bots are humans-only-excluded
 * from ranked/paid play.
 */

import {
  ASSAULT,
  EYE_HEIGHT,
  PITCH_LIMIT,
  TICK_DT,
  aimAngles,
  clamp,
  nearestObstacle,
  type ClientMessage,
  type GameMap,
  type PlayerSnapshot,
  type ServerMessage,
  type Vec3,
} from '@liquidate/shared';

const DESIRED_RANGE = 11; // metres the bot tries to hold
const TURN_RATE = 5.0; // rad/s aim slew (reaction speed)
const AIM_JITTER = 0.05; // radians of imperfect aim at difficulty 0
const FIRE_AIM_TOLERANCE = 0.12; // how "on target" before it shoots

export class ServerBot {
  private map?: GameMap;
  private yaw = 0;
  private pitch = 0;
  private seq = 0;
  private strafe: 1 | -1 = 1;
  private repath = 0;
  private route?: (msg: ClientMessage) => void;
  private stopped = false;

  /**
   * @param selfId the bot's connection id
   * @param difficulty 0..1 — higher = faster reaction + tighter aim
   */
  constructor(
    private readonly selfId: string,
    private readonly difficulty = 0.6,
  ) {}

  /** Wire the bot's outgoing inputs into its Room. */
  attach(route: (msg: ClientMessage) => void): void {
    this.route = route;
  }

  /** Stop acting (match ended). */
  stop(): void {
    this.stopped = true;
    this.route = undefined;
  }

  /** Receives every server message addressed to the bot's connection. */
  onMessage(msg: ServerMessage): void {
    if (this.stopped) return;
    if (msg.type === 'start') {
      this.map = msg.map;
      const spawn = msg.map.spawns[msg.selfSpawnIndex];
      this.yaw = spawn.yaw;
      this.pitch = 0;
    } else if (msg.type === 'snap') {
      this.onSnap(msg);
    }
  }

  private onSnap(snap: Extract<ServerMessage, { type: 'snap' }>): void {
    if (this.stopped || !this.map || !this.route) return;
    const self = snap.players.find((p) => p.id === this.selfId);
    if (!self) return;

    // Target the nearest live opponent (works for duel and FFA alike).
    let opp: PlayerSnapshot | undefined;
    let bestDist = Infinity;
    for (const p of snap.players) {
      if (p.id === this.selfId || !p.alive) continue;
      const d = Math.hypot(p.x - self.x, p.z - self.z);
      if (d < bestDist) {
        bestDist = d;
        opp = p;
      }
    }

    // Dead, or no live target: hold still (the server respawns us).
    if (!self.alive || !opp) {
      this.sendInput(0, 0);
      return;
    }

    const dt = TICK_DT;
    const selfEye: Vec3 = { x: self.x, y: self.y + EYE_HEIGHT, z: self.z };
    const oppEye: Vec3 = { x: opp.x, y: opp.y + EYE_HEIGHT, z: opp.z };
    const to: Vec3 = { x: oppEye.x - selfEye.x, y: oppEye.y - selfEye.y, z: oppEye.z - selfEye.z };

    // Aim: slew toward the target (reaction scales with difficulty).
    const want = aimAngles(to);
    const turn = TURN_RATE * (0.6 + this.difficulty * 0.8) * dt;
    this.yaw += clamp(angleDiff(this.yaw, want.yaw), -turn, turn);
    this.pitch = clamp(this.pitch + clamp(want.pitch - this.pitch, -turn, turn), -PITCH_LIMIT, PITCH_LIMIT);

    const dist = Math.hypot(to.x, to.z);
    const dirToOpp: Vec3 = norm({ x: to.x, y: 0, z: to.z });
    const hasLos = nearestObstacle(selfEye, dirToOpp, this.map.obstacles) > dist;

    // Movement: hold range, strafe, flip direction periodically.
    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 0.8 + Math.random() * 1.2;
      this.strafe = Math.random() < 0.5 ? -1 : 1;
    }
    const moveFwd = clamp((dist - DESIRED_RANGE) / 4, -1, 1);
    const moveRight = this.strafe;

    // Fire when aimed, in range, with LOS, ammo, not reloading.
    const aimErr = Math.abs(angleDiff(this.yaw, want.yaw)) + Math.abs(this.pitch - want.pitch);
    const willFire =
      hasLos &&
      dist <= ASSAULT.range &&
      aimErr < FIRE_AIM_TOLERANCE &&
      self.ammo > 0 &&
      !self.reloading;
    if (willFire) {
      // Imperfect aim so a human can win; less jitter at higher difficulty.
      const jitter = AIM_JITTER * (1 - this.difficulty * 0.6);
      this.yaw += (Math.random() * 2 - 1) * jitter;
      this.pitch += (Math.random() * 2 - 1) * jitter;
    }

    // Input first (sets the server's view + position), then the fire it backs.
    this.sendInput(moveFwd, moveRight);
    if (willFire) this.route({ type: 'fire', seq: this.seq });
  }

  private sendInput(moveFwd: number, moveRight: number): void {
    if (!this.route) return;
    this.seq++;
    this.route({
      type: 'input',
      seq: this.seq,
      dt: TICK_DT,
      moveFwd,
      moveRight,
      yaw: this.yaw,
      pitch: this.pitch,
    });
  }
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
