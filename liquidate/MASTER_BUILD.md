# LIQUIDATE — MASTER BUILD PROMPT (for Claude Code)

You are the lead engineer shipping **LIQUIDATE**, a stylized low-poly multiplayer browser FPS with a crypto-arena identity. The bar: **Krunker-tier look and performance, frags.fun-tier content depth** — but on a web/JS stack (Three.js + Node), which is the achievable, honest target for a solo build. We are explicitly NOT chasing realistic Unity/Unreal graphics.

The goal is a **real, playable, online game in front of players soon** — so we ship a lean vertical slice first, then layer content and polish.

## How this doc works

This is the orchestration layer. The detail lives in three companion specs you must read and obey:

- **`CLAUDE.md`** — the functional game + authoritative netcode (the engine of truth).
- **`STYLE.md`** — the stylized production milestones (S0–S7).
- **`ARTBIBLE.md`** — the exact, locked visual look (palette, materials, bloom, lighting, feel constants). The art bible wins any look dispute.
- **`/reference/`** — my working prototypes: `liquidate-mp/` (authoritative multiplayer that passed its netcode tests), `duel.html` (demo economy UX), `liquidate-stylized-s0.html` (the approved look). Use them as direction; rebuild clean.

Work **milestone by milestone**. After each: run tests, post before/after frames + frame-time/draw-call numbers, write a short summary (what changed, how to try it, `LIMITATION:` notes), then **STOP for my review**. Do not sprint ahead.

---

## Guardrails (non-negotiable, carried across all phases)

1. **Server-authoritative.** Clients send inputs only. The server owns position, hits, kills, ammo, abilities, currency, cosmetics ownership, and match outcome. Nothing visual or client-side may alter a hitbox or decide a hit.
2. **No real money in this codebase — yet.** All currency/ownership is **demo or Solana devnet**. No real-SOL custody, no mainnet wagering, no deposit/withdraw of value. We ship a real *free-to-play* game; the economy is the loop, real funds are a separate licensed track turned on later with legal advice. If a task needs custody of user funds, STOP and ask.
3. **Cosmetic-only, no pay-to-win.** Every weapon is available to all; skins/hats/capes/effects are purely visual. Fairness is the product.
4. **Data-driven everything.** New weapon / ability / class / map / skin / mode = new data (JSON/manifest), not engine edits.
5. **Performance & load are features.** Target **144fps @ 1080p on mid hardware** and a **small initial payload** (aim <20 MB, like the best web shooters). Pool, instance, cull, compress, lazy-load.

---

## Definition of "shippable v1" (the near-term target)

A stranger can click a link and within seconds be in a good-looking, smooth, fair online match. Concretely, v1 = **all of**:

- Authoritative online multiplayer: **FFA (up to ~6) and 1v1**, with **bots filling empty/free lobbies** so it's never empty.
- The **ARTBIBLE look** applied throughout (low-poly, neon, bloom, readable).
- **3 weapons** that feel distinct, **2 maps**, fast arcade **game feel** (movement, recoil, hitmarkers, juice).
- A **main menu → mode select → match → scoreboard** flow, basic settings (sens/FOV/quality), audio.
- **Free-to-play, no wallet required**, with a **demo currency** "pay-to-spawn / frag-to-earn" loop visible (simulated), so the economic identity is shown without any real funds.
- Runs at target fps, loads fast, deploys to a URL.

Everything beyond this (full rosters, abilities, classes, cosmetics, devnet token) is Phase B/C content — real, but post-v1.

---

## Content scope (what makes it feel like a real game — all data-driven)

Build the *systems* so this content is data, then fill it in over Phase B:

- **Weapons:** roster across archetypes (assault / SMG / sniper / pistol / shotgun / launcher), each defined by data (damage, fire rate, spread, recoil pattern, recovery, swap speed, model, sound). All server-validated. Target a frags.fun-style lineup over time; ship 3 in v1.
- **Abilities:** Valorant/frags-style kit — e.g. dash, double-jump/jetpack, deployable turret, smoke/flash, invis, heal/ammo pickup. Charge/cooldown-based, server-authoritative. Phase B.
- **Classes/loadouts:** a few classes pairing a primary + secondary ability and a default weapon feel; loadout persists to the account. Phase B.
- **Game modes:** FFA and 1v1 in v1; add Team Deathmatch and a "tournament"/stakes lobby (demo currency) in Phase B.
- **Maps:** modular kit (Kenney blocks restyled to ARTBIBLE); 2 in v1, grow to 4–5 hand-tuned competitive arenas themed to the crypto identity (e.g. Datacenter, Liquidation District, Trading Floor).
- **Bots:** fillable AI opponents with tunable difficulty (navmesh or waypoint nav, LOS, strafe/peek, beatable). Used in free lobbies and 1v1 practice; paid/ranked lobbies are humans-only.
- **Cosmetics:** skins (neon accent + emissive pattern swaps per ARTBIBLE), hats/capes (bone-socket meshes), kill effects/trails. Server-gated ownership, equip persists, shows in lobby + match + scoreboard. Phase B/C.
- **Accounts/persistence:** handle + stats + loadout + cosmetics in SQLite; loadout/identity follows the player across sessions/devices.
- **Economy loop (demo/devnet):** "spawn costs X, a frag takes their X, withdraw anytime" — implemented on **demo currency** for v1, optionally backed by a **devnet** balance + Phantom read-only connect in Phase C. Never mainnet/real funds here.

---

## Roadmap (each milestone: build → test → STOP)

### PHASE A — Vertical Slice → shippable v1

1. **A0 — Repo scaffold** (see scaffold section). Monorepo, shared package, server + client building and talking over WebSocket, tooling, one passing test.
2. **A1 — Authoritative core** = `CLAUDE.md` M1–M2: FPS feel, matchmaking, prediction/reconciliation, interpolation, server hitscan w/ occlusion, kills/respawn/winner, forfeit. Headless integration match test green.
3. **A2 — Stylized pass** = `STYLE.md` S0–S1 + `ARTBIBLE.md`: flat/toon shading, neon bloom, palette, low-poly CC0 character + viewmodel, loading screen. Big visual jump.
4. **A3 — Game feel + content min** = `STYLE.md` S2–S4 (scoped): arcade movement + juice, 3 weapons, 2 maps, bots filling lobbies, FFA + 1v1 modes.
5. **A4 — Menu, demo economy, ship** = main menu/mode-select/scoreboard, settings, audio, the simulated pay-to-spawn/frag-to-earn loop, accounts/persistence, perf+size budget met, deploy to a URL.
   **Gate:** v1 definition above is fully met. This is the "real game, soon-ish" deliverable.

### PHASE B — Content & depth (post-v1, iterative)

Full weapon roster, abilities, classes, Team Deathmatch + stakes lobby (demo), 2–3 more maps, matchmaking/ranked, cosmetics system (`STYLE.md` S5) with inventory + 3D inspect. Each weapon/ability/map/skin is a data add.

### PHASE C — Polish, identity & (optional) devnet

`STYLE.md` S6–S7 full polish (UI/audio/juice/accessibility), perf/size hardening, lag compensation + anti-cheat sanity checks (with the honest note that this stops teleport/speed/fire-rate cheats but NOT aimbots), and **optionally** a Solana **devnet** cosmetic token + Phantom read-only connect (cosmetics priced in token, holder perks) — strictly devnet, no real value. Mainnet/real funds remain a separate licensed track, not built here.

---

## Repo scaffold (deliver in A0)

```
liquidate/
├─ package.json            # npm workspaces: shared, server, client
├─ tsconfig.base.json
├─ .gitignore
├─ .eslintrc / .prettierrc
├─ CLAUDE.md  STYLE.md  ARTBIBLE.md  MASTER_BUILD.md
├─ README.md               # run instructions + honest done/not-done
├─ ATTRIBUTION.md          # CC0 asset credits
├─ shared/                 # config, world/map data, vector math, movement+collision (imported both sides)
├─ server/                 # authoritative server, rooms, matchmaking, sim, hit detection, bots, persistence (SQLite)
├─ client/                 # Three.js render, input, prediction/reconciliation, interpolation, HUD, screens, viewmodel, FX
│  └─ assets/              # low-poly CC0 models/textures/audio (manifest-driven, KTX2/Draco where useful)
├─ tests/                  # vitest unit tests + headless integration match test
└─ reference/              # my prototypes (read-only direction)
```

`.gitignore` must cover: `node_modules/`, `dist/`, `*.log`, `.env`, `.DS_Store`, build output, and any large raw asset working files. Use **Vite** (client) + **tsx/node** (server), TypeScript strict, ESLint + Prettier.

## How to work

- Start each milestone by restating its acceptance criteria, implement, run `npm test`, then summarize + STOP.
- `shared/` is the single source of truth for anything both sides need — never duplicate movement/hit math by hand.
- Every milestone: keep the integration match test green, add tests proving visuals/content can't alter hitboxes/outcomes, and report frame time + draw calls + bundle size.
- Keep `ARTBIBLE.md` adherence tight; update `README.md` and `ATTRIBUTION.md` as you go.

## Ship checklist (before calling v1 done)

- [ ] Cold-load under target size, fast TTI, real loading progress.
- [ ] 144fps @ 1080p on mid hardware (High); scales to integrated GPUs (Low).
- [ ] Two players on different networks can duel; bots fill empty lobbies.
- [ ] No client can fake a hit/position/kill/currency (tested).
- [ ] Look matches ARTBIBLE; players are readable.
- [ ] Menu→match→scoreboard flow + settings + audio complete.
- [ ] Demo economy loop works and reconciles (no value created/destroyed).
- [ ] Deployed to a public URL with notes.

---

Begin with **A0 (repo scaffold) only**. Read all three companion specs first and confirm you understand the scope, guardrails, and the locked art direction before writing any code.
