# CLAUDE.md — LIQUIDATE

Guidance for working in this codebase.

## What this is

LIQUIDATE is a browser-based **1v1 first-person shooter** with a crypto-arena
theme and a **play-money** "stake → winner sweeps the pot → house rake" economy
layer. Two real players duel; the server decides everything.

## Master brief & locked art direction

The full product brief lives in **`MASTER_BUILD.md`**; the **locked** visual look
lives in **`ARTBIBLE.md`** (the art bible wins any look dispute). Read both before
visual or content work. The bar is **Krunker-tier** stylized look/feel on a
Three.js + Node stack (not realistic Unity/Unreal), shipped as a lean online
vertical slice first, then expanded data-driven.

**Roadmap (build → test → STOP each milestone):**

- **M0 — Scaffold.** Met by this monorepo (workspaces `shared`/`server`/
  `client`, tooling, WebSocket, passing vitest, self-documenting docs).
- **M1 — Authoritative core.** Foundation in place (prediction/reconciliation,
  interpolation, server hitscan + occlusion, kills/respawn/winner, forfeit;
  integration match test green). Expands to 1v1 **and FFA up to ~6**.
- **M2 — Stylized pass.** Apply `ARTBIBLE.md` exactly: low-poly flat/toon
  shading, the locked palette, the **UnrealBloom signature**, low-poly CC0
  character + viewmodel, loading screen. (The current P0–P7 look is modern PBR;
  M2 re-skins it to the art bible. **144fps @1080p** is the perf target.)
- **M3 — Feel + slice content.** Arcade feel + juice, **3 weapons** (assault /
  SMG / sniper), **2 maps**, bots filling lobbies, FFA + 1v1.
- **M4 — Menu + demo economy + settings + audio + deploy** → shippable slice.

Then expand per `MASTER_BUILD.md` "later", one data-driven feature at a time.

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
