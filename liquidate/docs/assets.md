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

**Now wired (real art):** a CC0 rigged glTF — **RobotExpressive** (Tomás Laulhé /
Quaternius, mods by Don McCurdy; see `ATTRIBUTION.md`) — is loaded at boot with
its animation clips (`AssetManager.loadGLTF('avatar')`), stashed in
`avatarsource.ts`, and cloned per player by `riggedcharacter.ts`. It runs a
`THREE.AnimationMixer` with crossfades (idle→Idle, run→Running, jump→Jump,
shoot→Punch, reload→Wave, death→Death), a per-instance team-colour tint on the
body material, and the held weapon parented to the **right-hand bone socket**.
`createAvatar()` (`avatar.ts`) returns the rig when the asset is loaded and the
procedural figure otherwise — procedural stays the flagged zero-asset fallback.
`tests/avatar.test.ts` re-locks the cosmetic-only / hitbox-independent invariant.

### Source intake + conversion

Drop raw pack files (FBX/glTF/PNG) under `client/assets/raw/{characters,weapons,
environment,props,skins}/` (see that folder's README for naming), then optimise:

```
node scripts/optimize-gltf.mjs client/assets/raw/characters/Foo.glb \
                               client/public/assets/characters/foo.glb
```

The script applies dedup → prune → resample → **meshopt** compression (safe for
rigs; we avoid weld/simplify/join, which can tear skinning or animation tracks).
meshopt needs **no decoder files** (the decoder is bundled). KTX2/Basis textures
are a separate step (`toktx`); RobotExpressive ships **0 textures**, so none was
needed. Register the output in `client/src/manifest.ts` (data only).

## Maps & environment (P5)

Maps are **data** (`shared/src/map.ts` → `MAPS`/`MAP_LIST`): extents, wall
height, `obstacles` (the collide-able cover), and two spawns. Add a map by
adding an entry — the server picks from `MAP_LIST` automatically (or `MAP=<id>`
forces one). The server uses ONLY `obstacles`/`spawns`; geometry is the client's.

Environment art lives client-side in `client/src/env.ts`:

- `ENV_THEMES` gives each map a mood (fog + base floor/wall/obstacle colours),
  keyed by map id with a `DEFAULT_ENV` fallback.
- `buildDressing()` adds decoration — upper wall band, emissive accent trim, a
  ceiling with light strips, corner pylons, floor markings.

**"What you see is what you collide with" is preserved:** none of the dressing
is a collider. Every tall decorative element sits at the perimeter or above the
wall line; interior decor is flat floor markings — so nothing looks like cover
you can't actually use. `tests/env.test.ts` enforces this (no waist-height decor
in the interior). The accent pieces are returned so the skin system retints them.

**Now wired (real art):** a CC0 prop layer (Kenney Platformer kit, MIT — sky
clouds + perimeter grass/flags) is placed by `env.ts buildProps` and lives in
`world.propsGroup`. The prop clones **share** the AssetManager's cached geometry,
so the group is cleared **without disposing** on a map change (disposing would
corrupt the cache). The props are **non-colliding** decoration — collision stays
the simple `shared/` obstacles, so "what you see is what you collide with" holds:
clouds sit above the wall line, grass/flags hug the perimeter, never the interior
play space (`tests/env.test.ts` enforces this for both dressing and props).

**Verticality (real, server-authoritative):** ALL five maps now have a true upper
level — raised CATWALK obstacles (`box(..., y=2.2)`) that FLOAT at 2.2–2.6.
You walk under them on the ground and hop onto them from the 1.4 corner perches
(a 1.2 climb, under the ~1.7 jump height) or with the jetpack. They are dressed
with the CC0 Kenney `platform` slab, scaled to the obstacle footprint with its
walkable top aligned to the collidable top (`world.dressPlatforms`), so "what you
see is what you collide with" holds. Reachability + walk-under clearance are
guarded by `tests/maps.test.ts`. The collision is still just the AABBs in
`shared/`; the height-aware movement (stand-on / walk-under) was already there.

**Jump pads** (data: `GameMap.jumpPads`, all maps but Crossfire): floor zones that
launch a grounded player upward (`JUMP_PAD_SPEED`, in `shared/movement.ts` so
client prediction matches the server) — vertical mobility up to the catwalks.
Cosmetic decal is a bright cyan disc+ring (flat floor marking, non-colliding).
Guarded by `tests/shared.test.ts` + `tests/maps.test.ts`.

**Still to add:** richer modular building kits, real ramps (the AABB collision is
box-only, so ramps are currently stepped platforms), and `.ktx2`-textured PBR
floor/wall materials. Drop kits into `client/assets/raw/environment/` and optimise
with `scripts/optimize-gltf.mjs`.

## Skins (P4)

Skins are **data** (`shared/src/cosmetics.ts` → `SKINS`): id, name, CSS `color`,
and a cosmetic unlock threshold. Adding a skin = adding an entry. `accentHex()`
turns the colour into a 3D hue; `theme()` in `main.ts` applies it to the UI
accent (CSS), the arena neon (`world.setAccent`), and the viewmodel + tracers
(`weapon.setAccent`).

Cosmetic-only and **not** pay-to-win, by construction:

- A skin is **client-local** — never sent to the server (the wire protocol and
  server have no skin field), so it cannot affect movement, hits, or outcome.
- It never changes the **opponent's** appearance; the enemy stays a fixed,
  readable colour regardless of either player's skin. No visibility edge.
- `tests/skins.test.ts` asserts a skin carries only presentation fields.

**Textured skins later:** a richer skin could swap in a `.ktx2`-textured
material or a whole `.glb` weapon via the `AssetManager` — register it in the
manifest and extend `weapon.setAccent`/the theme path. Procedural colour tinting
is the zero-asset default.

## Attribution

Every external asset added MUST be logged in `ATTRIBUTION.md` with source,
author, and license. Prefer CC0 / permissive sources: Poly Haven, Quaternius,
Kenney, freesound (CC0).
