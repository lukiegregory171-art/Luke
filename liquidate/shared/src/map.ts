/**
 * The world / map definition is data, and it is the single source of truth.
 * The server uses these obstacles for collision and line-of-sight occlusion;
 * the client builds its Three.js geometry from the exact same data.
 *
 * Coordinate space: X is width (left/right), Z is depth (the long axis between
 * the two spawn ends), Y is up. The arena is centred on the origin, so it spans
 * [-width/2, width/2] in X and [-depth/2, depth/2] in Z. Cover is mirrored across
 * the centre so neither side has an advantage.
 */

import type { Vec3 } from './vec';

/** Axis-aligned bounding box, in world units. */
export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface SpawnPoint {
  pos: Vec3; // feet position
  yaw: number; // facing direction (radians); 0 looks down -Z
}

export interface GameMap {
  id: string;
  name: string;
  width: number; // X extent
  depth: number; // Z extent
  wallHeight: number;
  obstacles: AABB[];
  /** At least 2: [0] and [1] are the 1v1 ends; extras are used for FFA. */
  spawns: SpawnPoint[];
}

function box(cx: number, cz: number, sizeX: number, sizeZ: number, height: number, y = 0): AABB {
  return {
    min: { x: cx - sizeX / 2, y, z: cz - sizeZ / 2 },
    max: { x: cx + sizeX / 2, y: y + height, z: cz + sizeZ / 2 },
  };
}

/** A spawn at (x,z) facing the arena centre (origin). */
function facing(x: number, z: number): SpawnPoint {
  return { pos: { x, y: 0, z }, yaw: Math.atan2(x, z) };
}

const WIDTH = 30;
const DEPTH = 44;
const WALL_HEIGHT = 4;

/**
 * "Crossfire" — a symmetric arena. A tall central pillar plus mirrored
 * cover crates near each spawn and along the flanks, giving plenty of cover
 * to test occluded shots later.
 */
export const CROSSFIRE: GameMap = {
  id: 'crossfire',
  name: 'Crossfire',
  width: WIDTH,
  depth: DEPTH,
  wallHeight: WALL_HEIGHT,
  obstacles: [
    // Central pillar (blocks the direct spawn-to-spawn sightline).
    box(0, 0, 4, 4, 3.0),
    // Mirrored mid crates flanking the pillar.
    box(-8, 0, 2.5, 2.5, 1.4),
    box(8, 0, 2.5, 2.5, 1.4),
    // Mirrored cover ahead of each spawn.
    box(-6, -12, 3, 1.5, 1.4),
    box(6, -12, 3, 1.5, 1.4),
    box(-6, 12, 3, 1.5, 1.4),
    box(6, 12, 3, 1.5, 1.4),
    // Flank walls.
    box(-11, -4, 1.5, 6, 2.2),
    box(11, 4, 1.5, 6, 2.2),
  ],
  spawns: [
    // [0]/[1] are the 1v1 ends. -Z end faces +Z (yaw PI); +Z end faces -Z.
    { pos: { x: 0, y: 0, z: -DEPTH / 2 + 3 }, yaw: Math.PI },
    { pos: { x: 0, y: 0, z: DEPTH / 2 - 3 }, yaw: 0 },
    // Extra FFA spawns (corners), each facing the centre.
    facing(-11, -13),
    facing(11, -13),
    facing(-11, 13),
    facing(11, 13),
  ],
};

const REFINERY_W = 34;
const REFINERY_D = 38;

/**
 * "Refinery" — a wider arena built around four pillars in a diamond and a long
 * central divider with gaps, so there's no clean cross-map sightline and lots of
 * mid-range angles. Symmetric across both axes.
 */
export const REFINERY: GameMap = {
  id: 'refinery',
  name: 'Refinery',
  width: REFINERY_W,
  depth: REFINERY_D,
  wallHeight: WALL_HEIGHT,
  obstacles: [
    // Central divider in two halves with a gap at the middle.
    box(0, -7, 2, 8, 2.6),
    box(0, 7, 2, 8, 2.6),
    // Four pillars in a diamond around the centre.
    box(-9, 0, 2, 2, 3.0),
    box(9, 0, 2, 2, 3.0),
    box(0, -14, 2, 2, 3.0),
    box(0, 14, 2, 2, 3.0),
    // Mirrored corner crates.
    box(-12, -12, 3, 3, 1.4),
    box(12, 12, 3, 3, 1.4),
    box(12, -12, 3, 3, 1.4),
    box(-12, 12, 3, 3, 1.4),
  ],
  spawns: [
    { pos: { x: -REFINERY_W / 2 + 3, y: 0, z: 0 }, yaw: -Math.PI / 2 }, // -X end, facing +X
    { pos: { x: REFINERY_W / 2 - 3, y: 0, z: 0 }, yaw: Math.PI / 2 }, // +X end, facing -X
    facing(-13, -6),
    facing(13, -6),
    facing(-13, 6),
    facing(13, 6),
  ],
};

const VAULT_W = 32;
const VAULT_D = 42;

/**
 * "Vault" — a long hall with a central pillar, mirrored diagonal crates, flank
 * walls, and cover just ahead of each spawn. Symmetric across both axes so
 * neither end has an edge; spawns face down the long (Z) axis.
 */
export const VAULT: GameMap = {
  id: 'vault',
  name: 'Vault',
  width: VAULT_W,
  depth: VAULT_D,
  wallHeight: WALL_HEIGHT,
  obstacles: [
    // Central pillar (breaks the spawn-to-spawn line).
    box(0, 0, 4, 4, 2.8),
    // Mirrored diagonal crates around the centre.
    box(-9, -9, 3, 3, 1.4),
    box(9, 9, 3, 3, 1.4),
    box(9, -9, 3, 3, 1.4),
    box(-9, 9, 3, 3, 1.4),
    // Flank walls down each side.
    box(-12, 0, 1.5, 7, 2.2),
    box(12, 0, 1.5, 7, 2.2),
    // Cover ahead of each spawn.
    box(0, -13, 5, 1.5, 1.4),
    box(0, 13, 5, 1.5, 1.4),
  ],
  spawns: [
    { pos: { x: 0, y: 0, z: -VAULT_D / 2 + 3 }, yaw: Math.PI }, // -Z end, facing +Z
    { pos: { x: 0, y: 0, z: VAULT_D / 2 - 3 }, yaw: 0 }, // +Z end, facing -Z
    facing(-11, -14),
    facing(11, -14),
    facing(-11, 14),
    facing(11, 14),
  ],
};

/**
 * "Datacenter" — TWO-LEVEL vertical map: a raised central dais (1.2) for high
 * ground, tall server-rack pillars, mid-side steps (1.0), AND a ring of raised
 * CATWALKS (float at 2.2..2.6) that you reach from the steps (a 1.6 hop, under
 * the ~1.7 jump height) or with the jetpack, then cross around the racks. You
 * walk under the catwalks at ground level — real verticality. Symmetric.
 */
export const DATACENTER: GameMap = {
  id: 'datacenter',
  name: 'Datacenter',
  width: 36,
  depth: 40,
  wallHeight: 5,
  obstacles: [
    box(0, 0, 7, 7, 1.2), // central dais (jump up for high ground)
    // Server racks (tall cover; can't be stood on).
    box(-8, -8, 1.6, 1.6, 2.6),
    box(8, 8, 1.6, 1.6, 2.6),
    box(8, -8, 1.6, 1.6, 2.6),
    box(-8, 8, 1.6, 1.6, 2.6),
    // Mid-side step platforms (jumpable — the on-ramp to the upper ring).
    box(-13, 0, 2, 3, 1.0),
    box(13, 0, 2, 3, 1.0),
    // Raised CATWALKS (float at y 2.2..2.6): the upper ring. Hop on from the
    // steps; walk under them on the ground. 0.4 thick.
    box(-10, 0, 3, 3, 0.4, 2.2),
    box(10, 0, 3, 3, 0.4, 2.2),
    box(0, -10, 3, 3, 0.4, 2.2),
    box(0, 10, 3, 3, 0.4, 2.2),
    // Cover ahead of the Z-end spawns.
    box(0, -14, 4, 1.5, 1.2),
    box(0, 14, 4, 1.5, 1.2),
  ],
  spawns: [
    { pos: { x: 0, y: 0, z: -17 }, yaw: Math.PI },
    { pos: { x: 0, y: 0, z: 17 }, yaw: 0 },
    facing(-13, -13),
    facing(13, -13),
    facing(-13, 13),
    facing(13, 13),
  ],
};

/**
 * "Trading Floor" — TWO-LEVEL king-of-the-hill. A central "ticker tower" (top at
 * 2.6) is ringed by raised CATWALKS (also at 2.6) that you reach by hopping from
 * the 1.4 corner perches (a 1.2 climb, under the ~1.7 jump height) or with the
 * jetpack. The catwalks FLOAT (their underside is at 2.2), so you fight both on
 * the ground beneath them and on the upper ring above — real verticality. The
 * elevated slabs are non-cover at ground level (you walk under) and are dressed
 * with real CC0 platform models. Collision is still just these AABBs.
 */
export const TRADING_FLOOR: GameMap = {
  id: 'tradingfloor',
  name: 'Trading Floor',
  width: 38,
  depth: 38,
  wallHeight: 5,
  obstacles: [
    box(0, 0, 3, 3, 2.6), // central tower (reach the top from the steps)
    // Step platforms hugging the tower (hop ground -> step -> tower).
    box(-3.5, 0, 2, 2, 1.0),
    box(3.5, 0, 2, 2, 1.0),
    box(0, -3.5, 2, 2, 1.0),
    box(0, 3.5, 2, 2, 1.0),
    // Corner perches (jumpable vantage — the on-ramp to the upper ring).
    box(-10, -10, 2.5, 2.5, 1.4),
    box(10, 10, 2.5, 2.5, 1.4),
    box(10, -10, 2.5, 2.5, 1.4),
    box(-10, 10, 2.5, 2.5, 1.4),
    // Raised CATWALKS (float at y 2.2..2.6): the upper level. Walk under them at
    // ground; hop onto them from the perches; cross to the tower. 0.4 thick.
    box(-7, -7, 3, 3, 0.4, 2.2),
    box(7, 7, 3, 3, 0.4, 2.2),
    box(7, -7, 3, 3, 0.4, 2.2),
    box(-7, 7, 3, 3, 0.4, 2.2),
    // Flank walls.
    box(-15, 0, 1.5, 7, 2.2),
    box(15, 0, 1.5, 7, 2.2),
    // Spawn cover.
    box(0, -13, 5, 1.5, 1.2),
    box(0, 13, 5, 1.5, 1.2),
  ],
  spawns: [
    { pos: { x: 0, y: 0, z: -16 }, yaw: Math.PI },
    { pos: { x: 0, y: 0, z: 16 }, yaw: 0 },
    facing(-14, -14),
    facing(14, -14),
    facing(-14, 14),
    facing(14, 14),
  ],
};

export const MAPS: Record<string, GameMap> = {
  [CROSSFIRE.id]: CROSSFIRE,
  [REFINERY.id]: REFINERY,
  [VAULT.id]: VAULT,
  [DATACENTER.id]: DATACENTER,
  [TRADING_FLOOR.id]: TRADING_FLOOR,
};

export const MAP_LIST: GameMap[] = [CROSSFIRE, REFINERY, VAULT, DATACENTER, TRADING_FLOOR];

export const DEFAULT_MAP = CROSSFIRE;

/** Pick a random map (used per match). */
export function randomMap(): GameMap {
  return MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)];
}
