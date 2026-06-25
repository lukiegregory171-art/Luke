# Performance & shipping (P7)

How LIQUIDATE holds its frame rate and how to deploy it.

## Performance budget

Target: **60 fps at 1080p on mid-range hardware** on the `high` preset, scaling
down gracefully to weak devices on `low`. Several layers cooperate to hold that:

- **Quality presets** (`client/src/quality.ts`) — `low`/`medium`/`high`/`ultra`
  scale render resolution cap, shadow map size, and which post effects run
  (SSAO/bloom/SMAA/vignette/grain). Picked in the lobby; persisted.
- **First-run auto-detect** (P7) — with no saved preference, `detectQuality()`
  chooses a device-appropriate default from CPU cores / DPR / mobile UA. It errs
  toward smooth (weak/mobile → `low`) and never auto-selects `ultra`.
- **Dynamic resolution** — the renderer measures frame time and scales render
  scale between 0.6 and 1.0 to defend the target frame rate, then recovers when
  there's headroom. (On by default except `ultra`.)
- **Object pooling** (`pool.ts`) — tracers, impacts, and effects are recycled,
  so a firefight (incl. 8-pellet shotgun blasts) allocates nothing per shot: no
  GC hitches mid-match.
- **Shader warmup** — `world.warmup()` compiles materials + primes the post
  stack behind the loading screen, so the first played frame doesn't stutter
  linking GPU programs.
- **Perf HUD** — backtick toggles a stats.js + draw-call/FPS panel to verify the
  above on real hardware.

> LIMITATION: real fps can only be confirmed on real hardware/GPUs. CI/headless
> runs use software GL (swiftshader), which is not representative, so the numbers
> above are targets backed by architecture, not a headless benchmark.

## Bundle

The client build (P7) code-splits the heavy engine deps into their own cacheable
chunks (see `vite.config.ts` `manualChunks`):

| chunk    | contents               | ~gzip   |
| -------- | ---------------------- | ------- |
| `index`  | game/app code          | ~20 kB  |
| `three`  | three.js core          | ~177 kB |
| `postfx` | postprocessing + n8ao  | ~151 kB |
| `vendor` | remaining deps         | ~1 kB   |

Splitting doesn't reduce total bytes (three.js is inherently large) — the win is
**caching** (engine chunks survive app-only redeploys) and **parallel** download.
The app chunk is tiny, so iterating on game code ships a small diff.

## Build & run

```
npm run build     # bundles the server (esbuild) + client (vite) into dist/
npm run dev        # server + Vite client with HMR, for development
```

The server serves the built client and the WebSocket on one port (`/ws`), so
localhost, a forwarded Codespaces port, and production all behave identically.

## Deploy

- **Docker:** the root `Dockerfile` builds shared/server/client and runs the
  single Node process that serves both static files and the WebSocket.
- **Render:** `render.yaml` is a one-click blueprint for the above. (Deploying to
  a specific account needs that account's credentials — not bundled here.)

Set `MAP=<id>` to force a map, otherwise the server rotates `MAP_LIST` randomly.

## Guardrails held through the polish series

- **No real money** — play-money integer DEMO credits only; no real-value
  custody, deposits, withdrawals, or mainnet wagering.
- **Server-authoritative** — the client is never trusted for position, hits,
  ammo, currency, or outcome.
- **Presentation never touches authority** — all P0–P7 visuals/audio/cosmetics
  are client-only; `tests/guardrails.test.ts` statically forbids `shared/` and
  `server/` from importing any rendering/DOM code, and skins are never sent over
  the wire. So a skin, shader, tracer, animation, or screen shake is physically
  incapable of changing a hitbox or a result.
