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

export const MANIFEST: AssetManifest = [];
