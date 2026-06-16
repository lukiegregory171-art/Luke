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
  spawns: [SpawnPoint, SpawnPoint];
}

function box(cx: number, cz: number, sizeX: number, sizeZ: number, height: number, y = 0): AABB {
  return {
    min: { x: cx - sizeX / 2, y, z: cz - sizeZ / 2 },
    max: { x: cx + sizeX / 2, y: y + height, z: cz + sizeZ / 2 },
  };
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
    // -Z end, facing +Z into the arena (yaw = PI looks toward +Z).
    { pos: { x: 0, y: 0, z: -DEPTH / 2 + 3 }, yaw: Math.PI },
    // +Z end, facing -Z into the arena (yaw = 0 looks toward -Z).
    { pos: { x: 0, y: 0, z: DEPTH / 2 - 3 }, yaw: 0 },
  ],
};

export const MAPS: Record<string, GameMap> = {
  [CROSSFIRE.id]: CROSSFIRE,
};

export const DEFAULT_MAP = CROSSFIRE;
