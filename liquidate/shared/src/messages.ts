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
import type { MatchMode, WeaponId } from './config';

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
  jump?: boolean; // edge-triggered jump request
  thrust?: boolean; // held jump key (jetpack thrust)
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

// --- Cosmetics (server-authoritative ownership; DEMO currency only) ---------

/** Buy/unlock a weapon skin with DEMO currency (server validates price/balance). */
export interface BuySkinMessage {
  type: 'buySkin';
  skinId: string;
}

/** Equip a skin for a weapon (server validates you OWN it). Cosmetic only. */
export interface EquipSkinMessage {
  type: 'equipSkin';
  weapon: WeaponId;
  skinId: string;
}

// --- Economy (play-money / DEMO) -------------------------------------------

/** Create or load a demo account by handle. */
export interface LoginMessage {
  type: 'login';
  handle: string;
}

/** Enter matchmaking with a demo stake (server validates against balance). */
export interface QueueMessage {
  type: 'queue';
  stake: number;
  mode?: MatchMode; // defaults to 'duel' (1v1); 'ffa' is free-for-all
}

export interface DepositMessage {
  type: 'deposit';
  amount: number;
}

export interface WithdrawMessage {
  type: 'withdraw';
  amount: number;
}

/** Latency probe. Either side may send `ping`; the receiver echoes `pong` with
 *  the same `t`. The client measures its RTT; the server measures each
 *  client's RTT (used by lag compensation). */
export interface PingMessage {
  type: 'ping';
  t: number; // sender timestamp (ms), echoed back in pong
}

export type ClientMessage =
  | InputMessage
  | FireMessage
  | ReloadMessage
  | SwitchMessage
  | BuySkinMessage
  | EquipSkinMessage
  | LoginMessage
  | QueueMessage
  | DepositMessage
  | WithdrawMessage
  | PingMessage
  | PongMessage;

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
  mode: MatchMode;
  opponentId: PlayerId; // 1v1: the other player; FFA: '' (use `players`)
  players: PlayerId[]; // all player ids in the match (self + others)
  names: Record<PlayerId, string>; // display name per id (handle, or "BOT n")
  teams: Record<PlayerId, number>; // team index per id (0/1; TDM). 0 for non-team modes.
  selfSpawnIndex: number;
  map: GameMap; // the map this match is played on (may differ from init's default)
  stake: number; // each player's demo stake; pot = 2 * stake (FFA is free: 0)
}

/** Authoritative demo account state (sent after login and any balance change). */
export interface AccountMessage {
  type: 'account';
  id: PlayerId;
  handle: string;
  balance: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  owned: string[]; // owned weapon-skin ids (server-authoritative cosmetics)
  loadout: Record<WeaponId, string>; // equipped skin id per weapon
}

/** Current house treasury balance (accumulated rake + demo fees). */
export interface TreasuryMessage {
  type: 'treasury';
  balance: number;
}

/** Authoritative per-player state at a tick. */
export interface PlayerSnapshot {
  id: PlayerId;
  x: number;
  y: number;
  z: number;
  vx: number; // horizontal velocity (for client reconciliation)
  vy: number; // vertical velocity (jump/gravity reconciliation)
  vz: number;
  dashCd: number; // dash cooldown remaining (for client reconciliation)
  fuel: number; // jetpack fuel 0..1 (for client reconciliation + HUD)
  yaw: number;
  pitch: number;
  health: number;
  ammo: number;
  weapon: WeaponId;
  skin?: string; // equipped cosmetic skin id for the current weapon (others see it)
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
  weapon?: WeaponId; // weapon used (kill-feed icon)
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
  winner: PlayerId; // duel/ffa winner; '' for TDM (use winnerTeam)
  winnerTeam?: number; // TDM winning team index
  scores: Record<PlayerId, number>;
  stake: number; // each player's stake
  pot: number; // 2 * stake
  rake: number; // house rake taken from the pot
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
  | AccountMessage
  | TreasuryMessage
  | PingMessage
  | PongMessage;

// --- Helpers ---------------------------------------------------------------

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decode<T = ClientMessage | ServerMessage>(data: string): T {
  return JSON.parse(data) as T;
}
