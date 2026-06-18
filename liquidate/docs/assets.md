# Assets layout & pipeline (P1)

LIQUIDATE uses **two-layer art sourcing**:

1. **Procedural / engine-generated** — what ships today. The arena, weapon
   viewmodel, neon, IBL (procedural `RoomEnvironment`), and audio are all
   generated in code (`client/src/world.ts`, `weapon.ts`, `audio.ts`). The game
   is fully playable with **zero external art files**.
2. **Drop-in real assets** — the slot. Register a `.glb`/`.ktx2` in the manifest
   and the `AssetManager` loads it (Draco + meshopt geometry decompression,
   KTX2/Basis textures), caches it (LRU), and — if `preload: true` — shows it on
   the loading-screen progress bar. No engine code changes to add art.

Presentation never touches authority: models/textures are display-only and can
never affect movement, hit detection, currency, or match outcome (those live in
`shared/` + `server/` and are guarded by `tests/guardrails.test.ts`).

## Where files go

```
client/
  public/
    assets/            # committed art, served at /assets/…
      maps/            #   arena props / environment .glb
      characters/      #   player models (+ animations)
      weapons/         #   weapon viewmodels
      cosmetics/       #   skins / lazy-loaded extras
    decoders/          # decoder binaries (NOT committed yet — see below)
      draco/           #   Draco decoder (draco_decoder.wasm/.js)
      basis/           #   KTX2/Basis transcoder (.wasm/.js)
  src/
    manifest.ts        # the data: register assets here (no code change)
    assets.ts          # the engine: loaders, cache, progress
```

## Registering an asset

Edit `client/src/manifest.ts` — data only:

```ts
export const MANIFEST: AssetManifest = [
  { id: 'rifle', url: '/assets/weapons/rifle.glb', category: 'weapon', preload: true },
  { id: 'skin-neon', url: '/assets/cosmetics/neon.glb', category: 'cosmetic' }, // lazy
];
```

- `preload: true` → loaded up-front during the loading screen.
- omit `preload` → loaded lazily on first `assets.load('id')` (use for cosmetics
  so boot stays fast).

Then in code: `const rifle = await assets.load('rifle');` (resolves a fresh
clone; the cached source is reused, so repeated loads don't re-fetch).

## Decoders (only needed once compressed assets exist)

> **LIMITATION:** the Draco/meshopt/KTX2 decoder binaries are **not in the repo**
> — there are no compressed assets that need them yet, so committing ~1 MB of
> wasm would be dead weight.

When you add a compressed `.glb`/`.ktx2`, copy the decoders from the installed
three.js package into `client/public/decoders/`:

```
cp node_modules/three/examples/jsm/libs/draco/*   client/public/decoders/draco/
cp node_modules/three/examples/jsm/libs/basis/*   client/public/decoders/basis/
```

(meshopt is bundled as an ES module and needs no copied files.) The decoder path
is configurable via the `AssetManager` constructor if you prefer a CDN.

## Characters & animation (P2)

Players are drawn by `client/src/character.ts` — a **procedural** articulated
humanoid (torso/head/visor/arms/legs) animated from movement (run cycle scaled
by speed, idle breathing, death topple). One `Character` serves both the
networked opponent and the practice bot.

It is **cosmetic-only**: animation moves only child limbs, never the root, so it
can't move a player or shift a hitbox (hurtboxes are `hurtboxes(feet)` in
`shared/`). `tests/character.test.ts` locks that invariant in.

**Drop-in slot for a real rigged character:** register a skinned `.glb` with
named clips in the manifest (e.g. idle/run/death), load it via the
`AssetManager`, and drive a `THREE.AnimationMixer` from the same speed/alive
signals `Character.update()` already consumes. The procedural rig stays the
zero-asset fallback. Quaternius has CC0 rigged characters; Mixamo provides free
animations (check its license terms before shipping).

## Attribution

Every external asset added MUST be logged in `ATTRIBUTION.md` with source,
author, and license. Prefer CC0 / permissive sources: Poly Haven, Quaternius,
Kenney, freesound (CC0).
