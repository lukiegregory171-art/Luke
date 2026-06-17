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

// --- Player ----------------------------------------------------------------
export const PLAYER_RADIUS = 0.4; // horizontal collision radius (units = metres)
export const PLAYER_HEIGHT = 1.8; // full standing height
export const EYE_HEIGHT = 1.6; // camera / ray origin height above feet
export const MOVE_SPEED = 6.0; // max ground move speed, units/sec
export const MAX_HEALTH = 100;

// --- Movement feel (velocity-based; shared by prediction + authority) -------
export const GROUND_ACCEL = 14; // acceleration toward the wished direction
export const GROUND_FRICTION = 10; // deceleration when not accelerating
export const STOP_SPEED = 2.0; // friction floor so you stop crisply
export const DASH_SPEED = 15; // burst speed of a dash
export const DASH_COOLDOWN = 1.6; // seconds between dashes
export const WEAPON_SWITCH_TIME = 0.35; // brief delay after swapping weapons

// --- Hitboxes (spheres relative to feet position) --------------------------
// Used by server-side hit detection. Body covers the torso, head sits on top.
export const BODY_SPHERE = { centerY: 1.0, radius: 0.45 };
export const HEAD_SPHERE = { centerY: 1.65, radius: 0.22 };

// --- Match rules -----------------------------------------------------------
export const TARGET_KILLS = 3; // first to this many kills wins
export const RESPAWN_DELAY = 2.0; // seconds before respawn

// --- Weapons ---------------------------------------------------------------
export type WeaponId = 'rifle' | 'shotgun';

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

export const RIFLE: WeaponConfig = {
  id: 'rifle',
  name: 'Rifle',
  damage: 34,
  headshotMultiplier: 2.0,
  fireInterval: 0.12,
  magazine: 30,
  reloadTime: 1.8,
  range: 200,
  pellets: 1,
  spread: 0,
};

export const SHOTGUN: WeaponConfig = {
  id: 'shotgun',
  name: 'Scattergun',
  damage: 11,
  headshotMultiplier: 1.5,
  fireInterval: 0.7,
  magazine: 7,
  reloadTime: 2.4,
  range: 45,
  pellets: 8,
  spread: 0.08,
};

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  rifle: RIFLE,
  shotgun: SHOTGUN,
};

export const DEFAULT_WEAPON: WeaponId = 'rifle';
