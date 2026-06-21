/**
 * Tunable game constants. Both client and server import these so simulation,
 * prediction, and rendering all agree. Treat this file as the rules of the game.
 */

// --- Netcode ---------------------------------------------------------------
export const TICK_RATE = 30; // server simulation + snapshot Hz
export const TICK_DT = 1 / TICK_RATE; // seconds per server tick
export const SERVER_PORT = 8080; // WebSocket + HTTP port
/** Hard upper bound on a single input's dt (anti speed-hack). */
export const MAX_DT = 0.05;
/** Client renders the opponent this far in the past (entity interpolation). */
export const INTERP_MS = 100;

// --- Hardening (M6) --------------------------------------------------------
/** Look/aim pitch is clamped to this (radians) — server-validated. */
export const PITCH_LIMIT = 1.5;
/** Max simulated movement time the server will apply to one player per tick
 *  (anti speed-hack: bounds the effect of input flooding). */
export const MAX_TICK_DT = 0.05;
/** Cap on how far back lag compensation will rewind a target (ms). */
export const MAX_REWIND_MS = 250;
/** How long a disconnected player may take to reconnect before forfeiting (ms). */
export const RECONNECT_GRACE_MS = 10000;
/** How long a queued player waits for a human before a bot fills the lobby (ms). */
export const BOT_FILL_MS = 6000;

// --- Player ----------------------------------------------------------------
export const PLAYER_RADIUS = 0.4; // horizontal collision radius (units = metres)
export const PLAYER_HEIGHT = 1.8; // full standing height
export const EYE_HEIGHT = 1.6; // camera / ray origin height above feet
export const MOVE_SPEED = 8.5; // max ground move speed, units/sec (arcade feel, M3)
export const MAX_HEALTH = 100;

// --- Movement feel (velocity-based; shared by prediction + authority) -------
export const GROUND_ACCEL = 16; // acceleration toward the wished direction
export const GROUND_FRICTION = 10; // deceleration when not accelerating
export const STOP_SPEED = 2.0; // friction floor so you stop crisply
export const DASH_SPEED = 20; // burst speed of a dash
export const DASH_COOLDOWN = 1.6; // seconds between dashes
export const WEAPON_SWITCH_TIME = 0.35; // brief delay after swapping weapons

// --- Vertical movement (jump + gravity; shared by prediction + authority) ---
export const GRAVITY = 24; // units/s^2 pulling players down
export const JUMP_SPEED = 9; // upward launch velocity (~1.7u peak — clears a crate)
export const AIR_CONTROL = 0.45; // fraction of ground accel usable while airborne

// --- Jetpack ability (hold jump in the air to thrust; drains fuel) ----------
export const JETPACK_ACCEL = 42; // upward thrust accel while held (net +ve vs gravity)
export const JETPACK_MAX_RISE = 6; // cap on jetpack-driven rise speed (units/s)
export const FUEL_DRAIN = 0.55; // fuel/sec consumed while thrusting (~1.8s of flight)
export const FUEL_RECHARGE = 0.45; // fuel/sec regained while grounded

// --- Hitboxes (spheres relative to feet position) --------------------------
// Used by server-side hit detection. Body covers the torso, head sits on top.
export const BODY_SPHERE = { centerY: 1.0, radius: 0.45 };
export const HEAD_SPHERE = { centerY: 1.65, radius: 0.22 };

// --- Match rules -----------------------------------------------------------
export type MatchMode = 'duel' | 'ffa' | 'tdm';
export const TARGET_KILLS = 3; // 1v1: first to this many kills wins
export const RESPAWN_DELAY = 2.0; // seconds before respawn
export const FFA_SIZE = 6; // players in a free-for-all room (humans + bots)
export const FFA_TARGET_KILLS = 8; // FFA: first to this many frags wins
export const TDM_SIZE = 6; // players in a team deathmatch (3v3, humans + bots)
export const TDM_TARGET_KILLS = 30; // TDM: first TEAM to this many frags wins

// --- Economy (PLAY-MONEY / DEMO ONLY — never real funds or custody) ---------
// All amounts are integer "DEMO" credits held server-side in SQLite. This is a
// simulation of a stake/pot/rake model; there is no real money anywhere.
export const CURRENCY = 'DEMO';
export const STARTING_BALANCE = 1000; // granted when an account is first created
export const RAKE_BPS = 100; // house rake on the pot (100 bps = 1%)
export const DEPOSIT_FEE_BPS = 200; // demo deposit fee (2%)
export const WITHDRAW_FEE_BPS = 200; // demo withdraw fee (2%)
export const DEFAULT_STAKE = 50;
export const MAX_STAKE = 100000;

/** Basis-points fee of an amount, floored to an integer. */
export function bpsOf(amount: number, bps: number): number {
  return Math.floor((amount * bps) / 10000);
}

/** House rake taken from a pot. */
export function rakeOf(pot: number): number {
  return bpsOf(pot, RAKE_BPS);
}

// --- Weapons (data-driven; add a weapon = add data here) -------------------
export type WeaponId = 'assault' | 'smg' | 'sniper' | 'shotgun' | 'pistol' | 'lmg' | 'marksman';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  damage: number; // body damage (per pellet for multi-pellet weapons)
  headshotMultiplier: number;
  fireInterval: number; // seconds between shots (enforced server-side)
  magazine: number; // rounds per magazine
  reloadTime: number; // seconds
  range: number; // max hitscan distance
  pellets: number; // rays fired per shot (1 = single hitscan)
  spread: number; // max cone half-angle in radians (0 = pinpoint)
}

/** Balanced all-rounder; the default. Pinpoint per-shot (the SMG is the spray
 *  weapon); spray feel comes from recoil. ~4 body / 2 head to kill. */
export const ASSAULT: WeaponConfig = {
  id: 'assault',
  name: 'Assault',
  damage: 25,
  headshotMultiplier: 2.0,
  fireInterval: 0.1,
  magazine: 30,
  reloadTime: 1.8,
  range: 200,
  pellets: 1,
  spread: 0,
};

/** Fast, spray-y, short range; rewards closing distance. */
export const SMG: WeaponConfig = {
  id: 'smg',
  name: 'SMG',
  damage: 16,
  headshotMultiplier: 1.8,
  fireInterval: 0.07,
  magazine: 35,
  reloadTime: 1.5,
  range: 90,
  pellets: 1,
  spread: 0.03,
};

/** Slow, pinpoint, lethal; 1 headshot / 2 body. */
export const SNIPER: WeaponConfig = {
  id: 'sniper',
  name: 'Sniper',
  damage: 80,
  headshotMultiplier: 2.0,
  fireInterval: 0.95,
  magazine: 5,
  reloadTime: 2.6,
  range: 300,
  pellets: 1,
  spread: 0,
};

/** Close-range burst: 8 pellets, lethal point-blank, useless at range. */
export const SHOTGUN: WeaponConfig = {
  id: 'shotgun',
  name: 'Scattergun',
  damage: 11,
  headshotMultiplier: 1.5,
  fireInterval: 0.75,
  magazine: 6,
  reloadTime: 2.4,
  range: 40,
  pellets: 8,
  spread: 0.09,
};

/** Sidearm: quick, accurate, modest damage; a reliable backup. */
export const PISTOL: WeaponConfig = {
  id: 'pistol',
  name: 'Sidearm',
  damage: 22,
  headshotMultiplier: 2.0,
  fireInterval: 0.18,
  magazine: 12,
  reloadTime: 1.2,
  range: 120,
  pellets: 1,
  spread: 0.01,
};

/** Light machine gun: big mag, suppressive, sprays; slow to reload. */
export const LMG: WeaponConfig = {
  id: 'lmg',
  name: 'LMG',
  damage: 20,
  headshotMultiplier: 1.6,
  fireInterval: 0.08,
  magazine: 60,
  reloadTime: 3.0,
  range: 160,
  pellets: 1,
  spread: 0.04,
};

/** Semi-auto marksman rifle: hits hard at range between assault and sniper. */
export const MARKSMAN: WeaponConfig = {
  id: 'marksman',
  name: 'Marksman',
  damage: 45,
  headshotMultiplier: 2.0,
  fireInterval: 0.35,
  magazine: 12,
  reloadTime: 2.0,
  range: 250,
  pellets: 1,
  spread: 0,
};

/** Slot order (HUD keys 1..N). */
export const WEAPON_IDS: WeaponId[] = [
  'assault',
  'smg',
  'sniper',
  'shotgun',
  'pistol',
  'lmg',
  'marksman',
];

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  assault: ASSAULT,
  smg: SMG,
  sniper: SNIPER,
  shotgun: SHOTGUN,
  pistol: PISTOL,
  lmg: LMG,
  marksman: MARKSMAN,
};

export const DEFAULT_WEAPON: WeaponId = 'assault';

/** 1-based slot (HUD key) for a weapon. */
export function weaponSlot(id: WeaponId): number {
  return WEAPON_IDS.indexOf(id) + 1;
}

/** A fresh full-magazine map (data-driven over WEAPON_IDS). */
export function freshMagazines(): Record<WeaponId, number> {
  const out = {} as Record<WeaponId, number>;
  for (const id of WEAPON_IDS) out[id] = WEAPONS[id].magazine;
  return out;
}
