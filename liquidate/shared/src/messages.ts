/**
 * Wire protocol between client and server. Both sides import these types so the
 * message shapes can never drift.
 *
 * Guiding rule (server-authoritative): the client only ever sends *inputs* and
 * pings. It never asserts position, hits, kills, ammo, score, or currency — the
 * server decides all of that and broadcasts it in snapshots/events.
 *
 * NOTE: M0 only implements the `init` handshake and ping/pong. The remaining
 * message kinds are declared here so the protocol is defined up front; they are
 * wired up in later milestones.
 */

import type { GameMap } from './map';
import type { WeaponId } from './config';

export type PlayerId = string;

// --- Client -> Server ------------------------------------------------------

/** The only state the client is trusted to send: its inputs. */
export interface InputMessage {
  type: 'input';
  seq: number; // monotonically increasing; server echoes lastProcessedSeq
  dt: number; // seconds since previous input (server clamps to MAX_DT)
  moveFwd: number; // -1..1
  moveRight: number; // -1..1
  yaw: number; // radians
  pitch: number; // radians
  dash?: boolean; // edge-triggered dash request
}

export interface FireMessage {
  type: 'fire';
  seq: number; // the input seq this shot is associated with
}

export interface ReloadMessage {
  type: 'reload';
}

export interface SwitchMessage {
  type: 'switch';
  weapon: WeaponId;
}

export interface PingMessage {
  type: 'ping';
  t: number; // client timestamp (ms), echoed back in pong
}

export type ClientMessage =
  | InputMessage
  | FireMessage
  | ReloadMessage
  | SwitchMessage
  | PingMessage;

// --- Server -> Client ------------------------------------------------------

export interface InitMessage {
  type: 'init';
  id: PlayerId; // this client's player id
  tickRate: number;
  map: GameMap;
}

export interface WaitingMessage {
  type: 'waiting';
}

export interface StartMessage {
  type: 'start';
  opponentId: PlayerId;
  selfSpawnIndex: 0 | 1;
  map: GameMap; // the map this match is played on (may differ from init's default)
}

/** Authoritative per-player state at a tick. */
export interface PlayerSnapshot {
  id: PlayerId;
  x: number;
  y: number;
  z: number;
  vx: number; // horizontal velocity (for client reconciliation)
  vz: number;
  dashCd: number; // dash cooldown remaining (for client reconciliation)
  yaw: number;
  pitch: number;
  health: number;
  ammo: number;
  weapon: WeaponId;
  reloading: boolean;
  alive: boolean;
  score: number;
}

export interface SnapshotMessage {
  type: 'snap';
  tick: number;
  serverTime: number; // ms
  /** Per-player last input seq the server has processed (for reconciliation). */
  ack: Record<PlayerId, number>;
  players: PlayerSnapshot[];
}

export interface FireEvent {
  type: 'fire';
  id: PlayerId;
  weapon: WeaponId;
  origin: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
}

export interface HitEvent {
  type: 'hit';
  shooter: PlayerId;
  target: PlayerId;
  headshot: boolean;
  damage: number;
}

export interface KillEvent {
  type: 'kill';
  killer: PlayerId;
  victim: PlayerId;
}

export interface RespawnEvent {
  type: 'respawn';
  id: PlayerId;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface OverMessage {
  type: 'over';
  winner: PlayerId;
  scores: Record<PlayerId, number>;
}

export interface OppLeftMessage {
  type: 'oppLeft';
}

export interface PongMessage {
  type: 'pong';
  t: number; // echoed client timestamp
}

export type ServerMessage =
  | InitMessage
  | WaitingMessage
  | StartMessage
  | SnapshotMessage
  | FireEvent
  | HitEvent
  | KillEvent
  | RespawnEvent
  | OverMessage
  | OppLeftMessage
  | PongMessage;

// --- Helpers ---------------------------------------------------------------

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMessage | ServerMessage>(data: string): T {
  return JSON.parse(data) as T;
}
