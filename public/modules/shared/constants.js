// Shared between server (Node, authoritative simulation) and client (prediction/rendering).
// Keeping these identical on both ends is what makes client-side prediction reconcile cleanly.

export const TICK_RATE = 60; // server physics steps per second
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_RATE = 20; // world-state broadcasts per second

export const GRAVITY = 28;
export const WALK_SPEED = 6.5;
export const SPRINT_SPEED = 10;
export const AIR_CONTROL = 0.5;
export const JUMP_SPEED = 9.5;
export const DOUBLE_JUMP_SPEED = 8.5;
export const DASH_SPEED = 22;
export const DASH_DURATION = 0.18; // seconds the dash impulse lasts
export const DASH_COOLDOWN = 4; // seconds
export const GROUND_FRICTION = 10;
export const AIR_FRICTION = 0.5;

// Player capsule approximated as an axis-aligned box for collision.
export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;

export const TEAM = Object.freeze({ RED: 'red', BLUE: 'blue' });
export const TEAM_COLOR = Object.freeze({ red: 0xd6423c, blue: 0x3c7ad6 });

export const KILL_LIMIT = 25;
export const RESPAWN_TIME = 3; // seconds
export const MATCH_RESTART_DELAY = 8; // seconds after match_over before the next match starts

export const MSG = Object.freeze({
  // client -> server
  JOIN: 'join',
  INPUT: 'input',
  FIRE: 'fire',
  RELOAD: 'reload',
  SWITCH_WEAPON: 'switch_weapon',
  CHAT: 'chat',
  // server -> client
  WELCOME: 'welcome',
  SNAPSHOT: 'snapshot',
  HIT: 'hit',
  HIT_CONFIRM: 'hit_confirm',
  KILL: 'kill',
  DEATH: 'death',
  RESPAWN: 'respawn',
  SCORE: 'score',
  MATCH_OVER: 'match_over',
  PLAYER_JOIN: 'player_join',
  PLAYER_LEAVE: 'player_leave',
  AMMO: 'ammo',
  EXPLOSION: 'explosion',
});
