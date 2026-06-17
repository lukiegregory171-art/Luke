# LIQUIDATE

A server-authoritative **1v1 browser FPS** with a crypto-arena theme and a
**play-money** economy layer (stake → winner sweeps the pot → house takes a
rake). Two real players duel; the server is the single source of truth for
position, hits, kills, ammo, score, and currency.

> **No real money.** Everything in the economy is simulated play-money integers,
> clearly labelled **DEMO**. There is no custody of funds, no fiat, no real-SOL
> escrow, and no mainnet wagering anywhere in this codebase. See `CLAUDE.md`.

## Stack

- **Server:** Node.js (LTS) + TypeScript, `ws` for WebSockets, plain HTTP for
  static assets. No heavyweight framework.
- **Client:** TypeScript + Three.js, bundled by Vite.
- **Shared:** a `shared/` package (config, map, vector math, movement+collision,
  wire protocol) imported by **both** sides so prediction and authority run
  identical code.
- **Tests:** Vitest (unit) + a headless integration match test (from M2).

## Run it in the browser — GitHub Codespaces (no local install)

The repo ships a dev container (`.devcontainer/`), so you can run everything in
the browser:

1. On the GitHub repo, click **Code → Codespaces → Create codespace** on the
   `claude/zealous-cannon-4jsywq` branch. It builds a Node 20 container and
   installs dependencies automatically (takes a minute the first time).
2. In the Codespace terminal:
   ```bash
   cd liquidate
   npm run dev
   ```
3. Codespaces forwards **port 5173** and pops up the URL — click **Open in
   Browser** (use a real browser tab, not the in-editor preview, so pointer lock
   works). If it doesn't open automatically, use the **Ports** tab and open the
   `5173` URL.
4. Click **FIND MATCH** (online 1v1 — open a second tab and click FIND MATCH to
   duel yourself) or **PRACTICE RANGE** (offline vs a bot). **WASD** move,
   **mouse** aim, **click/hold** fire, **Space** dash, **R** reload, **1**/**2**
   switch weapon, **Esc** release the mouse.

Only port 5173 is exposed: the Vite client proxies the game's WebSocket (`/ws`)
to the internal Node server, so a single forwarded port is all you need. The
forwarded URL is private to your GitHub account by default — to let a second
player join later (M2), set the port's visibility to **Public** in the Ports tab.

## Run it locally

Requires Node 20+. From the `liquidate/` directory:

```bash
npm install
npm run dev      # starts the server (:8080) and the Vite client (:5173)
```

Open <http://localhost:5173>. Controls: **WASD** move, **mouse** aim,
**click/hold** fire, **Space** dash, **R** reload, **1**/**2** switch weapon
(Rifle / Scattergun), **Esc** release the mouse.

- **FIND MATCH** — queue for an online 1v1. **Open a second tab** (or share the
  URL) and click FIND MATCH there too; the two clients are matched and you duel,
  first to 3 kills. Everything (movement, hits, score, winner) is decided by the
  authoritative server.
- **PRACTICE RANGE** — an offline 1v1 against a bot.

Other commands:

```bash
npm test         # run unit tests
npm run typecheck
npm run lint
npm run format
npm run build    # bundle server -> server/dist, build client -> client/dist
```

## Architecture (target)

- **Fixed server tick:** 30 Hz simulation + snapshot broadcast.
- **Client → server:** input messages only (`seq`, clamped `dt`, move axes,
  yaw/pitch) plus discrete `fire`/`reload`. The client is never trusted for
  outcomes.
- **Server → client:** `init`, `waiting`, `start`, `snap` (authoritative state +
  per-player `lastProcessedSeq`), events (`fire`/`hit`/`kill`/`respawn`/`over`/
  `oppLeft`), and `pong`.
- **Prediction + reconciliation** for the local player; **entity interpolation**
  (~100 ms) for the opponent.
- **Hit detection** is a server-side ray (eye → aim) vs the opponent's body/head
  spheres, occluded by map geometry so cover works.

## Status — what's done / not done

### Done (M0 — Foundation)

- Monorepo (npm workspaces): `shared`, `server`, `client`, `tests`.
- Strict TypeScript, ESLint (flat config) + Prettier.
- `shared/` exports config, map data, vector math, and movement+collision.
- Node WebSocket server with the `init` handshake; client connects and logs it.
- Single-origin networking: the client talks to `/ws` on its own host (Vite
  proxies it in dev, the Node server serves it in prod), so localhost,
  Codespaces, and the production build all work with the same client code.
- GitHub Codespaces dev container (`.devcontainer/`) — run it entirely in the
  browser with one forwarded port.
- `npm run dev` runs both; `npm test` passes (vec math, dt clamp, movement +
  collision).

### Done (M1 — Core FPS, local feel)

- Three.js arena built from the shared `GameMap` (floor, neon grid, perimeter
  walls, edge-lit cover boxes) — what you see is what you collide with.
- Pointer-lock mouse-look (yaw/pitch) wired so the camera's forward exactly
  matches the shared `aimDirection`.
- WASD movement through the shared `stepMovement` (the same collision code the
  server will run), with a click-to-play / Esc-to-pause menu.
- Hitscan rifle: crosshair, muzzle flash, fading tracer beam, recoil; ammo +
  auto/manual reload; hitmarkers (white body / red headshot).
- A target dummy whose body/head meshes match the shared hurtbox spheres; it
  drops on kill, tracks a score, and respawns away from the player.
- Ray math (`raySphere`, `rayAABB`, occluded `hitscan`) lives in `shared/` and
  is unit-tested, so the server reuses it unchanged in M2.
- Runtime-verified headless (WebGL renders, no console errors) and the solo
  game logic (firing, occlusion, ammo/reload) is unit-tested.

### Done (M2 — Authoritative multiplayer)

- Matchmaking queue pairs two players into a 1v1 **Room** that runs the 30 Hz
  authoritative sim; the menu now offers **FIND MATCH** (online) and
  **PRACTICE RANGE** (the M1 solo mode).
- **Server authority**: inputs are integrated with the shared movement code,
  fires resolved with the shared occluded hitscan, and fire-rate / ammo /
  reload / health / score / outcome all decided server-side. Clients only send
  inputs.
- **Client-side prediction + reconciliation** for the local player (snap to the
  server position, replay unacked inputs) and **entity interpolation** (~100 ms)
  for the opponent.
- Server `fire`/`hit`/`kill`/`respawn`/`over`/`oppLeft` events drive tracers,
  hitmarkers, a damage flash, a kill banner, scores, respawns, and the
  match-over screen. First to 3 kills wins; disconnect forfeits to the opponent.
  Live **ping** readout from ping/pong.
- **Headless integration test** boots the real server and drives two scripted
  WebSocket clients through a full match (matchmaking → movement+acks → a shot
  blocked by cover → headshots → kill → respawn → second kill → winner) and a
  forfeit case. Verified two real browser tabs matchmake and exchange snapshots.

### Done (M3 — Gameplay depth)

- **Practice bot**: PRACTICE RANGE is now an offline 1v1 vs an AI that strafes,
  holds mid-range, respects line of sight, and aims imperfectly (fair/beatable).
  It moves with the shared movement code and is shot with the shared hitscan.
- **Two maps**: Crossfire and Refinery; a match picks one at random and the
  client rebuilds the arena from the chosen map (sent in `start`).
- **Second weapon**: a Scattergun (multi-pellet spread, server-side RNG) beside
  the Rifle. Switch with **1**/**2**; the server tracks the weapon and ammo.
- **Movement polish**: velocity-based acceleration/friction and a **dash**
  (Space, with cooldown) — all in `shared`, with velocity + dash cooldown in
  snapshots so client prediction/reconciliation stays exact.
- **Feedback**: hitmarkers (white/red), a directional **damage indicator**, a
  **kill feed**, a damage flash, and a kill banner.
- **Audio**: synthesized SFX (shoot/hit/reload/dash/kill/death) via Web Audio —
  no asset files.

### Not done yet
- **M4** — accounts + stats (SQLite), play-money balance, stake/pot/rake/treasury
  lobby flow, demo deposit/withdraw. (Play-money only.)
- **M5** *(optional, devnet only)* — read-only wallet connect for cosmetic/ranked
  utility behind a feature flag. No wagering, no real value.
- **M6** — lag compensation, reconnection grace, anti-cheat sanity checks,
  structured logging, Docker deploy.

## Note on repo location

This project lives in the `liquidate/` subdirectory of a larger personal repo so
it does not collide with the unrelated app at the repo root. All commands above
are run from inside `liquidate/`.
