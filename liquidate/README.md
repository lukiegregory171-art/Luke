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
   Browser**. (If it doesn't open automatically, use the **Ports** tab and open
   the `5173` URL.)

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

Open <http://localhost:5173>. The page connects to the server over WebSocket and
shows the `init` handshake (your assigned id, the tick rate, and the loaded map).

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

### Not done yet

- **M1** — Three.js arena, pointer-lock mouse-look, WASD + collision feel,
  hitscan firing (tracer/muzzle/crosshair), ammo + reload, target dummy.
- **M2** — matchmaking, rooms, prediction/reconciliation, opponent
  interpolation, server-side occluded hitscan, kills/respawn/scores,
  match-over + forfeit, latency display, headless integration test.
- **M3** — practice bot, second map, second weapon, movement polish, hit
  feedback, kill feed, audio.
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
