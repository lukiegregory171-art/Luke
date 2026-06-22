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

**Rig (real art):** the player body is a CC0 **rigged glTF** (RobotExpressive —
Quaternius/Don McCurdy) driven by an `AnimationMixer` (idle/run/jump/shoot/reload/
death crossfades), team-tinted via a per-instance material override so green vs
red still reads instantly. The procedural figure is the flagged zero-asset
fallback. Held weapon + cosmetics attach to bone sockets. (Drop better packs into
`client/assets/raw/` — see `docs/assets.md`.)

## Materials

- **Matte:** `MeshStandardMaterial { flatShading: true, roughness: 0.95, metalness: 0 }`
- **Solid:** `MeshStandardMaterial { flatShading: true, color, emissive: color, emissiveIntensity: 0.15–0.35 }`
  — a bold flat colour with a **faint** self-illumination so saturated hues stay
  readable in shadow. This is NOT a neon glow (there is no bloom pass); it just
  keeps colour from going muddy where the sun doesn't reach.
- **Signage / floor grid:** clean canvas **albedo** maps (subtle grid lines on a
  light floor; crisp candlestick "ticker" charts on a light panel). Flat, no glow.

All geometry is **chunky, low-poly, flat-shaded** with bold solid colour.

**Map props (real art):** real CC0 props (Kenney — sky clouds, perimeter grass +
corner flags) dress the arena as a **non-colliding** decorative layer
(`env.ts buildProps`). Collision stays the simple `shared/` obstacles — decor is
never fake cover (clouds sit above the wall line; grass/flags hug the perimeter).
Drop richer kits into `client/assets/raw/environment/`.

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

## Weapons (distinct, stylised — Rivals-tier, not realistic)

Each archetype has its **own multi-part low-poly model** with a clearly different
silhouette (built in `client/src/weaponmodel.ts`, forward = −Z) — receiver,
barrel, magazine, grip, stock, sight/rail, muzzle, scope where relevant — plus
its **own first-person hold pose**, reload dip, and shot sound:

- **Pistol** — small, short barrel, compact.
- **SMG** — stubby body, short barrel, tall extended magazine; fast/snappy.
- **Assault** — longer receiver, stock, mid barrel, rail + sight.
- **Sniper** — very long barrel, big scope, stock; long thin silhouette.
- **Shotgun** — wide chunky body, wide barrel, pump; short and wide.
- **LMG** — bulky receiver, heavy barrel, big ammo box.
- **Marksman** — medium body + mid scope (between assault and sniper).

Keep them **chunky, clean, flat-shaded stylised** — NOT photoreal (realism would
clash with the bright flat world).

## Weapon skins (cosmetic, data-driven, rarity ladder)

Roblox-Rivals-style skins: many per weapon, all **procedural** (material-driven,
no per-skin textures) so a new skin is **one catalog entry** in
`shared/src/weaponskins.ts`. A skin is data only:
`{ id, weapon, name, rarity, base, secondary, finish, emissive?, emissiveColor?, anim?, particle? }`.

Flair escalates with rarity (signature UI colour per tier):

| Rarity | Colour | Treatment |
| --- | --- | --- |
| Common | grey `#9aa7b0` | single solid recolour, matte (free default) |
| Uncommon | green `#3fbf6b` | two-tone, slight metalness |
| Rare | blue `#3f8efc` | metallic / chrome / camo + accent |
| Epic | purple `#a35bff` | bold pattern + emissive accent parts |
| Legendary | gold `#f5b73d` | animated emissive (pulse/flow) + gold/chrome + sparkle |
| Exotic | magenta `#ff4dd2` | rainbow/animated shader + particle aura — showpiece |

**Hard rules (non-negotiable):**

- **Cosmetic-only.** A skin/model NEVER changes stats, balance, or hit detection
  (hitboxes are server-side spheres from feet position — there is no skin
  parameter). Asserted in `tests/weaponskins.test.ts`.
- **Server-authoritative ownership.** Accounts own skins server-side (SQLite);
  you can only equip what you own, and buying is a validated DEMO-currency
  transaction. A modified client can't grant itself skins — at most it changes
  how its own gun looks to itself.
- **Applied everywhere:** first-person viewmodel, the third-person held weapon
  other players see (broadcast `skin` id in the snapshot), and the kill-feed.
- **DEMO play-money only** for pricing/unlocks; optional Solana **devnet**
  cosmetic token later, behind a flag. **Never real money, never pay-to-win.**

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
