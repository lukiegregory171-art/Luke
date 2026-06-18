# Attribution

LIQUIDATE's *systems* are the deliverable; sourced art is placeholder-quality to
be replaced by commissioned assets later. This file tracks third-party content.

## Art / assets

**None yet.** As of P0 there are **no external art assets** in the repo. All
looks are procedural / engine-generated:

- **Image-based lighting** comes from Three.js's procedural `RoomEnvironment`
  (no HDRI file). `scene.environment` is the drop-in slot for a real HDRI later
  (e.g. a CC0 Poly Haven `.hdr`).
- Materials, the neon grid, and obstacle edges are shader/material-based.
- Audio is synthesized at runtime via the Web Audio API (no sample files).

As of P1 the asset *pipeline* exists (manifest-driven glTF + Draco/meshopt +
KTX2 loading, LRU cache, lazy cosmetics — see `client/src/assets.ts`), but the
manifest (`client/src/manifest.ts`) is empty: still **no external art**. Layout
and how to register assets are documented in [`docs/assets.md`](docs/assets.md).

When real assets are added, list each here with **source, author, license**
(prefer CC0 / permissive — Poly Haven, Quaternius, Kenney, freesound CC0) and
keep the matching files under `client/public/assets/` (see `docs/assets.md`).

## Libraries (npm, not bundled art)

- [Three.js](https://threejs.org) — MIT
- [postprocessing](https://github.com/pmndrs/postprocessing) (pmndrs) — Zlib
- [stats.js](https://github.com/mrdoob/stats.js) — MIT
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — MIT
- [ws](https://github.com/websockets/ws) — MIT
