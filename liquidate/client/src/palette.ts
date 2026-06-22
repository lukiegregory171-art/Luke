/**
 * The LOCKED palette + material helpers (ARTBIBLE.md). One source of truth so
 * the whole client reads from the same hex values. Cosmetic only — colours never
 * touch authority. `palette.test.ts` pins these to the art bible.
 *
 * Direction: BRIGHT, FLAT, CLEAN, COLOURFUL ARCADE (Krunker / 1v1.lol). Bold
 * solid colours on a bright daytime scene, flat shading, minimal post-processing.
 * There is no bloom — colour reads from the hue itself, not from glow.
 */

import * as THREE from 'three';

export const COLORS = {
  // Bright daytime sky (gradient) + pale airy fog.
  sky: 0xbfe3f2, // gradient zenith
  horizon: 0xeaf6fb, // gradient horizon / pale fog

  // Surfaces: bright neutrals.
  surface: 0xf2f4f5, // off-white
  surface2: 0xc9d1d4, // light warm grey
  floor: 0xe4e8ea, // light floor
  wall: 0xd5dde0, // light wall
  crate: 0xe6d9a8, // default crate (sand)

  // Team + brand — bright SOLID blocks of colour (no neon glow).
  green: 0x2bd96b, // team green / brand
  red: 0xff4d4d, // team red
  gold: 0xe8b84b, // SOL gold (crypto identity)

  // Bright accent blocks used to theme maps.
  skyBlue: 0x4fc3f7,
  grass: 0x7cc96b,
  sand: 0xe6d9a8,
  coral: 0xff8a5c,

  // Gear + effects.
  gunBody: 0x3a4754, // blocky weapon slate
  tracer: 0xfff0a0, // bright readable tracer
  outline: 0x223040, // dark toon edge / outline

  // Lighting (bright, even, readable).
  hemiSky: 0xdceffa,
  hemiGround: 0xc8c3b4,
  sun: 0xfff6e8,
} as const;

/** Matte, flat-shaded SOLID surface (walls, crates, bodies, guns, signage). */
export function matte(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
    ...opts,
  });
}

/**
 * Bright solid colour with a touch of self-illumination so it still reads in
 * shadow (team colours, accent trim, the centre prop). This is NOT a neon glow —
 * there is no bloom pass; the small emissive just keeps a saturated hue from
 * going muddy where the sun doesn't reach.
 */
export function solid(
  color: number,
  emissiveIntensity = 0.25,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.7,
    metalness: 0,
    emissive: color,
    emissiveIntensity,
    ...opts,
  });
}
