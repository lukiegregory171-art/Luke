# ARTBIBLE.md — LIQUIDATE locked visual direction

This is the **locked** look. The art bible wins any look dispute. Detail comes
from **shape + neon**, not textures. Target: Krunker-tier stylized clarity on a
Three.js stack — NOT realistic Unity/Unreal graphics.

> Status: this is the **M2 target**. The current build (M0–M1 foundation +
> P0–P7 polish) uses a modern PBR/neon pipeline; M2 re-skins it to this spec.

## Palette (exact)

| Use                | Hex       |
| ------------------ | --------- |
| env / bg / fog     | `#070B0C` |
| floor              | `#0B1112` |
| walls              | `#0E1719` |
| crates             | `#14201E` |
| TEAM GREEN / brand | `#16F08A` |
| TEAM RED           | `#FF3B47` |
| SOL gold           | `#E8B84B` |
| neon cyan          | `#36E6FF` |
| neon magenta       | `#FF45C8` |

Environments are **dark and desaturated** so bright players / pickups / neon POP
(competitive readability is the point).

## Players (readability)

Dark body + bright **TEAM-COLOR emissive** on visor + chest + a **ground ring**.
Clean, instantly readable silhouette. Team color is the only thing that should
read at a glance.

## Materials

- **Matte:** `MeshStandardMaterial { flatShading: true, roughness: 0.85, metalness: 0.05 }`
- **Neon:** `MeshStandardMaterial { color: 0x05100C, flatShading: true, emissive: <paletteColor>, emissiveIntensity: 2.2–2.6 }`
- **Floors / panels / signage:** emissive **canvas maps** (glowing grid, LED
  dots, candlestick "ticker" charts) at `emissiveIntensity 1.1–1.6`.

All geometry is **low-poly, flat-shaded** with stepped/toon lighting.

## Lighting

- `HemisphereLight(sky #6FD9FF, ground #0A1412, 0.55)`
- warm key `DirectionalLight(#FFF0D8, 1.15)` with **PCFSoft** shadows
- a **cyan** and a **magenta** `PointLight` as rims
- a warm hero `PointLight` at a central rotating emissive **"arena core"**
  (octahedron + torus halo)

## Renderer

- `ACESFilmicToneMapping`, exposure **1.05**
- fog **18–60**
- camera **FOV 80**
- `pixelRatio = min(devicePixelRatio, 2)`

## Bloom is the signature

`EffectComposer → RenderPass → UnrealBloomPass(strength 0.9, radius 0.55, threshold 0.85) → OutputPass`

Keep **threshold ≈ 0.85** so ONLY emissives bloom. This single pass sells the
whole look.

## Game feel constants (tune from here)

- Move ~**8.5 u/s**, FOV **80**, fast TTK.
- Fire rate ~**0.1s**. Headshot if hit point **y > 1.85** (placeholders: head
  **60** / body **25**) — all server-authoritative.
- Recoil: **+0.05/shot**, cap **0.18**, decay **0.9/s**, plus viewmodel kick.
- Screen shake **0.18** on fire, decay **1.2/s**. Viewmodel **bob + sway**.
- Feedback: hitmarkers (white / **red** on headshot), gold/red floating damage
  numbers, light tracers `#BAFFF0`, impact spark particles, kill feed.

## Assets

CC0 only, kept low-poly/flat: **Quaternius** (rigged characters), **Kenney**
(weapons + modular map blocks), **Poly Pizza** (extras), **Poly Haven**
(HDRI/textures). **Re-material every sourced asset to the palette above.** If
none are wired, use chunky procedural placeholder geometry and note it. Keep it
data-driven so commissioned art drops in later. Log everything in
`ATTRIBUTION.md`.
