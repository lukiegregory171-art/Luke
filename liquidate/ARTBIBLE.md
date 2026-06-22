# ARTBIBLE.md — LIQUIDATE locked visual direction

This is the **locked** look: **BRIGHT, FLAT, CLEAN, COLOURFUL ARCADE** — think
Krunker / 1v1.lol. Bright daylight, chunky blocky low-poly geometry, bold SOLID
colours, crisp and high-contrast, **minimal post-processing**, very readable,
runs at very high fps. The opposite of dark/moody/cinematic. The art bible wins
any look dispute. Detail comes from **shape + bold solid colour**, not textures
and **not glow** — there is no bloom.

> This direction REPLACES the previous dark/neon/cyberpunk art bible. Anywhere
> the code still says "neon" / "bloom" in an old comment, this document wins.

## Palette (exact)

Bright neutrals for surfaces, bold solid colours for everything that must read.

| Use                       | Hex                                                            |
| ------------------------- | -------------------------------------------------------------- |
| sky gradient (top→horizon)| `#BFE3F2` → `#EAF6FB`                                          |
| pale fog                  | `#EAF6FB`                                                      |
| surface off-white         | `#F2F4F5`                                                      |
| surface light warm grey   | `#C9D1D4`                                                      |
| floor / wall (light)      | `#E4E8EA` / `#D5DDE0`                                          |
| TEAM GREEN / brand        | `#2BD96B`                                                     |
| TEAM RED                  | `#FF4D4D`                                                     |
| SOL gold (crypto identity)| `#E8B84B`                                                     |
| map accent blocks         | sky blue `#4FC3F7`, grass `#7CC96B`, sand `#E6D9A8`, coral `#FF8A5C` |

Surfaces are **bright neutrals**; players, pickups and accent structures are
**bold solid colour** so they POP against the light arena (competitive
readability is still the point — now achieved with contrast + hue, not glow).

## Players (readability)

A **big solid TEAM-COLOUR body** — chunky blocky humanoid, one bold colour, clean
readable silhouette — with a **dark visor** that shows which way they face and a
**white chest plate** for contrast. Team colour (bright green ally vs bright red
enemy) is the thing that reads at a glance. No thin emissive strips on dark
bodies.

## Materials

- **Matte:** `MeshStandardMaterial { flatShading: true, roughness: 0.95, metalness: 0 }`
- **Solid:** `MeshStandardMaterial { flatShading: true, color, emissive: color, emissiveIntensity: 0.15–0.35 }`
  — a bold flat colour with a **faint** self-illumination so saturated hues stay
  readable in shadow. This is NOT a neon glow (there is no bloom pass); it just
  keeps colour from going muddy where the sun doesn't reach.
- **Signage / floor grid:** clean canvas **albedo** maps (subtle grid lines on a
  light floor; crisp candlestick "ticker" charts on a light panel). Flat, no glow.

All geometry is **chunky, low-poly, flat-shaded** with bold solid colour.

## Lighting (bright + even + readable)

- `HemisphereLight(sky #DCEFFA, ground #C8C3B4, 0.9)` — strong even fill.
- one warm-white "sun" `DirectionalLight(#FFF6E8, 1.1)` with **PCFSoft** soft
  shadows at a modest map size.
- a gradient daytime **sky dome** (zenith `#BFE3F2` → horizon `#EAF6FB`).
- **No** cyan/magenta neon rim lights, **no** dark mood.
- light, airy **pale fog** far out for depth — never dark fog.

## Renderer

- `NoToneMapping` + correct **sRGB** output, so colours stay bright and saturated
  (ACES would crush/desaturate them).
- light, **airy fog** (near ~40, far scales with the map).
- camera **FOV 80**.
- `pixelRatio = min(devicePixelRatio, 2)`.

## Post-processing (stripped back)

`EffectComposer → RenderPass → OutputPass`

That's the whole chain: **just light anti-aliasing (MSAA) and a correct sRGB
output**. **NO bloom, NO vignette, NO scanlines, NO grain, NO heavy tone
mapping.** Goal: a crisp, sharp, bright, high-contrast image. (Optional future
hook: a thin dark toon outline on characters/weapons, off on Low — perf-cheap.)

## UI (bright arcade)

- **No** dark trading-terminal aesthetic, **no** monospace, **no** scanlines.
- Font: a bold **rounded** sans (Nunito / Baloo 2, with a system rounded
  fallback).
- Panels: white / very light, **rounded corners**, soft drop shadow, one bright
  accent colour. Flat and modern.
- HUD: minimal + clean — big bold health number + simple rounded bar, big clear
  ammo counter, a crisp thin crosshair with a hairline outline (no glow), clean
  rounded kill-feed chips top-left, simple score pill. Uncluttered.
- Menus: bright, bold, playful, big **rounded pill buttons** with a bright accent.
- Scoreboard: clean rounded panel, bold readable rows.
- Keep the crypto/economy info (balance, frags, rake) presented in this bright
  arcade style.

## Game feel constants (tune from here)

- Move ~**8.5 u/s**, FOV **80**, fast TTK.
- Fire rate ~**0.1s**. Headshot if hit point **y > 1.85** (placeholders: head
  **60** / body **25**) — all server-authoritative.
- Recoil: **+0.05/shot**, cap **0.18**, decay **0.9/s**, plus viewmodel kick.
- Screen shake **0.18** on fire, decay **1.2/s**. Viewmodel **bob + sway**.
- Feedback: hitmarkers (white / **red** on headshot), gold/red floating damage
  numbers, bold readable tracers, impact spark particles, kill feed.

## Assets

CC0 only, kept low-poly/flat: **Quaternius** (rigged characters), **Kenney**
(weapons + modular map blocks), **Poly Pizza** (extras), **Poly Haven**
(HDRI/textures). **Re-material every sourced asset to the bright palette above**
(bold solid colours, flat shading — no glow). If none are wired, use chunky
procedural placeholder geometry and note it. Keep it data-driven so commissioned
art drops in later. Log everything in `ATTRIBUTION.md`.
