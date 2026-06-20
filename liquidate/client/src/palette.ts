/**
 * The LOCKED palette + material helpers (ARTBIBLE.md). One source of truth so
 * the whole client reads from the same hex values. Cosmetic only — colours never
 * touch authority. `palette.test.ts` pins these to the art bible.
 */

import * as THREE from 'three';

export const COLORS = {
  env: 0x070b0c, // bg / fog
  floor: 0x0b1112,
  wall: 0x0e1719,
  crate: 0x14201e,
  green: 0x16f08a, // team / brand
  red: 0xff3b47, // team
  gold: 0xe8b84b, // SOL
  cyan: 0x36e6ff, // neon
  magenta: 0xff45c8, // neon
  tracer: 0xbafff0,
  neonBase: 0x05100c, // base colour of an emissive "neon" material
  keyLight: 0xfff0d8,
  hemiSky: 0x6fd9ff,
  hemiGround: 0x0a1412,
} as const;

/** Matte, flat-shaded surface (walls, crates, bodies). */
export function matte(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.05,
    ...opts,
  });
}

/** Emissive neon that crosses the bloom threshold (intensity 2.2–2.6). */
export function neon(emissive: number, intensity = 2.4) {
  return new THREE.MeshStandardMaterial({
    color: COLORS.neonBase,
    flatShading: true,
    emissive,
    emissiveIntensity: intensity,
  });
}
