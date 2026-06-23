/**
 * Asset manifest (P1) — DATA, not code. This is the one place to register real
 * art (`.glb` models, `.ktx2` textures) without editing engine code: add an
 * entry and the AssetManager handles Draco/meshopt/KTX2 decode, caching, and
 * (for `preload`) the loading-screen progress bar.
 *
 * It is intentionally EMPTY: LIQUIDATE ships on procedural geometry/materials
 * (see world.ts / weapon.ts), so there is nothing external to load yet. Files
 * referenced here live under `client/public/assets/…` — see docs/assets.md.
 *
 * Example once a model exists:
 *   { id: 'rifle', url: '/assets/weapons/rifle.glb', category: 'weapon', preload: true }
 */

import type { AssetManifest } from './assets';

export const MANIFEST: AssetManifest = [
  // Rigged player avatar (CC0 "RobotExpressive" by Tomás Laulhé / Quaternius,
  // mods by Don McCurdy — see ATTRIBUTION.md). Loaded with its animation clips
  // at boot (via assets.loadGLTF) and team-tinted per player; the procedural
  // articulated figure (character.ts) stays the zero-asset fallback.
  { id: 'avatar', url: '/assets/characters/robot.glb', category: 'character' },

  // Decorative environment props (CC0 "Kenney" Platformer kit, MIT — see
  // ATTRIBUTION.md). Non-colliding visual layer placed per map (env.ts buildProps):
  // clouds in the sky, grass + corner flags at the perimeter. Preloaded so they're
  // resident for synchronous placement when a map loads.
  { id: 'env-cloud', url: '/assets/env/cloud.glb', category: 'prop', preload: true },
  { id: 'env-grass', url: '/assets/env/grass.glb', category: 'prop', preload: true },
  { id: 'env-flag', url: '/assets/env/flag.glb', category: 'prop', preload: true },
  // Square slab used to dress raised CATWALK platforms (floating obstacles) with
  // real art, scaled to the obstacle footprint (see world.ts).
  { id: 'env-platform', url: '/assets/env/platform.glb', category: 'prop', preload: true },

  // Real CC0 weapon models (Kenney FPS kit, MIT) for 2 archetypes; the others
  // stay procedural. Used by the first-person viewmodel + the inspect turntable,
  // recoloured by the equipped skin (see weaponmodel.ts WEAPON_GLB).
  { id: 'wpn-rifle', url: '/assets/weapons/rifle.glb', category: 'weapon', preload: true },
  { id: 'wpn-pistol', url: '/assets/weapons/pistol.glb', category: 'weapon', preload: true },
];
