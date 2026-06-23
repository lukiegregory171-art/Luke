# CLAUDE.md — LIQUIDATE

Guidance for working in this codebase.

## What this is

LIQUIDATE is a browser-based **1v1 first-person shooter** with a crypto-arena
theme and a **play-money** "stake → winner sweeps the pot → house rake" economy
layer. Two real players duel; the server decides everything.

## Master brief & locked art direction

The full product brief lives in **`MASTER_BUILD.md`**; the **locked** visual look
lives in **`ARTBIBLE.md`** (the art bible wins any look dispute). Read both before
visual or content work. The look is **BRIGHT, FLAT, CLEAN, COLOURFUL ARCADE**
(Krunker / 1v1.lol): bright daylight, chunky blocky low-poly geometry, bold solid
colours, minimal post-processing (no bloom), crisp and very readable, on a
Three.js + Node stack (not realistic Unity/Unreal). Shipped as a lean online
vertical slice first, then expanded data-driven.

**Roadmap (build → test → STOP each milestone):**

- **M0 — Scaffold.** ✅ Monorepo (workspaces `shared`/`server`/`client`),
  tooling, WebSocket, passing vitest, self-documenting docs.
- **M1 — Authoritative core.** ✅ Prediction/reconciliation, interpolation,
  server hitscan + occlusion, kills/respawn/winner, forfeit; integration green.
- **M2 — Stylized pass.** ✅ `ARTBIBLE.md` look: **bright flat arcade** — chunky
  low-poly geometry in bold solid colours, bright daytime rig (hemisphere + warm
  sun, soft shadows, gradient sky), **minimal post (no bloom)**, procedural
  low-poly character + viewmodel, loading screen. (144fps @1080p target; CC0 art
  is a drop-in via the P1 AssetManager.)
- **M3 — Feel + slice content.** ✅ Arcade feel + juice, **3 data-driven
  weapons** (assault/SMG/sniper), 3 maps, **server bots fill lobbies**, **FFA
  (up to 6) + 1v1**.
- **M4 — Menu + demo economy + settings + audio + scoreboard + deploy.** ✅
  Lobby (sign-in/stake/deposit/withdraw/skins/mode buttons), demo stake→pot→rake
  economy, settings (volume/mute/sensitivity/FOV/graphics), synth audio, live
  (Tab) + end-of-match scoreboard, Docker/Render deploy. **Phase A slice done.**

Then expand per `MASTER_BUILD.md` "later" (Phase B/C), one data-driven feature
at a time.

## Weapons & cosmetic skins (data-driven)

- **Distinct models:** each weapon archetype has its own multi-part low-poly
  model + first-person pose in `client/src/weaponmodel.ts` (one builder, shared by
  the viewmodel, the inspect turntable, and the third-person held weapon).
- **Real GLB models (drop-in, currently DISABLED):** `WEAPON_GLB` maps archetypes
  to real CC0 weapon `.glb`s; `buildWeaponModel` uses the GLB when its asset is
  resident and recolours it with the skin's body material (flat-shaded, on-style),
  else the procedural model. It is intentionally **empty right now** so all 7 guns
  share ONE consistent style (procedural) — a 2-real/5-procedural mix read as
  inconsistent. The pipeline + 2 staged Kenney models remain; re-enable by adding
  a `wpn-*` manifest entry + a `WEAPON_GLB` row (ideally fill the whole set from
  one pack so it stays consistent + distinct). Shared geometry isn't disposed
  (`WeaponModel.shared`).
- **Skins catalog:** `shared/src/weaponskins.ts` — many skins per weapon across a
  6-tier rarity ladder (Common→Exotic). Treatments are **procedural** (finish /
  emissive / anim / particle), so **adding a skin = one catalog entry**; the
  client materials live in `client/src/skinmat.ts`.
- **Cosmetic-only, always:** skins/models never touch stats, balance, or hit
  detection (server hitboxes are spheres from feet — no skin parameter). The
  locker, inspect, viewmodel and opponent rendering are pure presentation.
- **Server-authoritative ownership:** the `Bank` (SQLite) owns each account's
  `owned_skins` + `loadout`; `buySkin`/`equipSkin` are validated server-side
  (can't equip what you don't own; buying spends DEMO currency). The equipped
  skin id is broadcast in snapshots so others see it. Invariants are covered by
  `tests/weaponskins.test.ts`. **DEMO/devnet only — never real money, never
  pay-to-win.**

## Avatars & asset pipeline (real art)

- **Source intake:** drop real CC0/permissive packs into `client/assets/raw/…`
  (see its README). Optimise with `node scripts/optimize-gltf.mjs <in> <out>`
  (gltf-transform: dedup + prune + resample + **meshopt** — no weld/simplify, to
  keep rigs intact); ship the result under `client/public/assets/…` and register
  it (data-only) in `client/src/manifest.ts`. Decoders aren't needed for meshopt
  (bundled); KTX2 textures would (see `docs/assets.md`).
- **Rigged avatar:** the player body is a CC0 rigged glTF (RobotExpressive,
  Quaternius/Don McCurdy — `ATTRIBUTION.md`) loaded at boot with its clips and
  cloned per player (`riggedcharacter.ts`, `AnimationMixer` crossfades:
  idle/run/jump/shoot/reload/death). Team colour is a per-instance material tint;
  the held weapon hangs off the **right-hand bone socket**. `createAvatar`
  (`avatar.ts`) returns the rig when loaded, else the **procedural** figure
  (`character.ts`) — procedural is the flagged fallback, never the final look.
- **Cosmetic-only, always:** avatars are placed from authoritative server state
  and never touch hit detection (hitboxes are spheres from feet). Locked by
  `tests/avatar.test.ts` + `tests/character.test.ts`.
- **Map props:** real CC0 env props (Kenney clouds/grass/flags) are a
  **non-colliding** decorative layer placed by `env.ts buildProps` (clones live
  in `world.propsGroup`, cleared without disposing since they share cached
  geometry). Collision/occlusion stays the simple `shared/` obstacles — "what you
  see is what you collide with"; `tests/env.test.ts` enforces no fake cover.

## Hard rules (do not violate)

1. **No real money, ever.** The economy is play-money integers only. No
   real-SOL escrow, no custody of funds, no fiat, no deposit/withdraw of
   anything with value, no mainnet wagering. This is a legal boundary. If a task
   seems to require holding user funds, STOP and ask.
2. **Server-authoritative.** The client may never be trusted for position,
   hits, kills, ammo, currency, or match outcome. Clients send inputs; the
   server decides. Trusting the client for any of these is a bug.
3. **Don't fake the hard parts.** Where lag compensation or anti-cheat is
   incomplete, leave a `// LIMITATION:` comment and call it out in the summary.
4. **Small, reviewable commits.** One concern per commit. Tests pass before a
   milestone is "done".

## Layout

```
shared/   config, map data, vector math, movement+collision, wire protocol
server/   authoritative server, (later) matchmaking, rooms, simulation, hit detection
client/   Three.js renderer, input, prediction/reconciliation, interpolation, HUD
tests/    vitest unit tests + (later) headless integration match test
```

`shared/` is the **single source of truth** for anything both sides need.
Movement and collision live in `shared/src/movement.ts` and are imported by both
the server (authority) and the client (prediction). **Never** duplicate that
math — if you're about to, refactor into `shared/` instead.

## Conventions

- TypeScript, strict, ESM everywhere.
- Coordinates: X = width, Z = depth (long axis), Y = up. Arena centred on origin.
- Yaw/pitch: `yaw = 0, pitch = 0` looks down `-Z` (Three.js default forward).
- `@liquidate/shared` is consumed as TS source (no build step) via package
  `exports`; the client and tests alias it to `shared/src/index.ts`.

## Commands

```
npm install         # from liquidate/
npm run dev         # server (tsx watch) + Vite client, concurrently
npm test            # vitest
npm run typecheck   # tsc --noEmit across all packages
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # bundle server (esbuild) + build client (vite)
```

## How to work

Milestone by milestone. Restate the milestone's acceptance criteria, implement,
run `npm test`, write a short summary (what changed, how to try it, anything to
test by hand, any `LIMITATION` notes), then STOP for review.
