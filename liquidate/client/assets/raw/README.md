# Asset intake — drop real art here

This is the **source drop-in** for professional low-poly stylised art (Synty
POLYGON / KayKit / Quaternius / Kenney). Drop raw `FBX`/`glTF`/`PNG` files in the
folders below; I convert them to optimised, ship-ready `.glb` + `.ktx2` under
`client/public/assets/…` and register them in `client/src/manifest.ts`.

> **How to hand them to me (remote/git-only):** commit the files to the branch
> `claude/zealous-cannon-4jsywq` and push. That's the reliable path — this is a
> cloud sandbox, so I can only see files that are in git (or a URL I'm allowed to
> fetch — egress is restricted, so don't count on it). If a pack is large, say so
> and we'll trim to the meshes we use before committing.

> **Licensing (important):** CC0 packs (Quaternius, Kenney, KayKit free) are safe
> to commit and ship. **Synty POLYGON is paid and its EULA forbids redistributing
> the raw source** — do NOT commit Synty `.fbx`/source to a **public** repo. If
> you go Synty, use a private repo (or hand me a private link). Every shipped
> asset gets logged in `ATTRIBUTION.md`.

## Folders & naming (names map to code ids)

```
characters/   one rigged humanoid + an animation set (idle, run, strafe, jump,
              shoot, reload, death). glTF with named clips preferred; or a base
              mesh + Mixamo FBX clips and I'll merge them.
                e.g.  soldier.glb           (skinned mesh, T/A-pose)
                      anims/idle.fbx run.fbx shoot.fbx reload.fbx jump.fbx death.fbx

weapons/      ONE model per archetype, barrel facing -Z, ~real-world scale.
              File name = weapon id:
                pistol.glb  smg.glb  assault.glb  sniper.glb  shotgun.glb
                lmg.glb  marksman.glb            (lmg/marksman optional)

environment/  modular kit pieces for building maps with verticality (floors,
              walls, ramps, catwalks, jump pads, railings, pillars, crates).
              Keep names descriptive: floor_4x4.glb ramp.glb catwalk.glb
              wall_4.glb pillar.glb crate.glb railing.glb …

props/        non-colliding decoration (barrels, signage, lights, plants…).
              decorative only — never used for collision.

skins/        designed weapon-skin texture sets (optional — procedural skins are
              the fallback). One folder per skin id (see catalog ids below):
                skins/<weaponId>_<key>/albedo.png
                                       emissive.png   (optional)
                                       metalrough.png (optional, R=metal G=rough)
              e.g. skins/assault_crimson/albedo.png
```

**Code ids to match**

- Weapons: `pistol`, `smg`, `assault`, `sniper`, `shotgun`, `lmg`, `marksman`
  (`shared/src/config.ts`).
- Maps: `crossfire`, `refinery`, `vault`, `datacenter`, `tradingfloor`
  (`shared/src/map.ts`).
- Skin ids: `<weaponId>_<key>` (`shared/src/weaponskins.ts`, e.g. `assault_crimson`).

## What happens to these files

1. I optimise: `gltf-transform` (Draco + meshopt) for meshes, KTX2/Basis for
   textures — steps documented in `docs/assets.md`.
2. Output ships under `client/public/assets/{characters,weapons,maps,cosmetics}/`.
3. Registered (data-only) in `client/src/manifest.ts`; loaded by the existing
   `AssetManager`. The procedural box models stay as the zero-asset fallback.

Collision/occlusion stays the **simple shapes in `shared/`** — these art files
are a visual layer only and never change hitboxes (locked by tests).
