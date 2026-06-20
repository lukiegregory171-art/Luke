# Attribution

LIQUIDATE's *systems* are the deliverable; sourced art is placeholder-quality to
be replaced by commissioned assets later. This file tracks third-party content.

## Art / assets

**None yet.** There are **no external art assets** in the repo. The M2 look
(`ARTBIBLE.md`) is entirely procedural / engine-generated:

- **Lighting** is a hand-built rig (hemisphere + warm key with PCF soft shadows
  + cyan/magenta point rims + a warm hero light on the rotating "arena core") —
  no IBL/HDRI. A real CC0 Poly Haven `.hdr` could drop into `scene.environment`.
- Materials are flat-shaded matte + emissive **neon** on the locked palette
  (`client/src/palette.ts`). The glowing **floor grid** and **candlestick
  "ticker"** signage are procedural emissive **canvas maps**
  (`client/src/textures.ts`) — no image files.
- **Player characters** (P2) are a procedural articulated rig built from
  primitives, re-skinned in M2 to dark body + team-colour emissive (visor /
  chest / ground ring). The drop-in slot for a rigged CC0 `.glb` (Quaternius) is
  documented in `docs/assets.md`.
- Audio is synthesized at runtime via the Web Audio API (no sample files).

As of P1 the asset *pipeline* exists (manifest-driven glTF + Draco/meshopt +
KTX2 loading, LRU cache, lazy cosmetics — see `client/src/assets.ts`), but the
manifest (`client/src/manifest.ts`) is empty: still **no external art**. Layout
and how to register assets are documented in [`docs/assets.md`](docs/assets.md).

When real assets are added, list each here with **source, author, license**
(prefer CC0 / permissive — Poly Haven, Quaternius, Kenney, freesound CC0) and
keep the matching files under `client/public/assets/` (see `docs/assets.md`).

## Libraries (npm, not bundled art)

- [Three.js](https://threejs.org) — MIT (incl. its example `EffectComposer` /
  `UnrealBloomPass` / `OutputPass` for the signature bloom)
- [stats.js](https://github.com/mrdoob/stats.js) — MIT
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — MIT
- [ws](https://github.com/websockets/ws) — MIT

> M2 replaced the pmndrs `postprocessing` + `n8ao` post stack with three's
> built-in `UnrealBloomPass`, cutting ~145 kB gzip off the bundle. Those packages
> are no longer imported (still in `package.json`; safe to prune in a ship pass).
