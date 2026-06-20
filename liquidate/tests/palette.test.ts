/**
 * M2 locks the visual direction (ARTBIBLE.md). This pins the exact palette and
 * the matte/neon material recipe so the look can't silently drift, and confirms
 * the neon emissive crosses into the "blooms" range (intensity 2.2–2.6). Purely
 * cosmetic data — none of it can touch a hitbox or outcome.
 */

import { describe, expect, it } from 'vitest';
import { COLORS, matte, neon } from '../client/src/palette';

describe('locked palette (ARTBIBLE.md)', () => {
  it('pins the exact hex values', () => {
    expect(COLORS.env).toBe(0x070b0c);
    expect(COLORS.floor).toBe(0x0b1112);
    expect(COLORS.wall).toBe(0x0e1719);
    expect(COLORS.crate).toBe(0x14201e);
    expect(COLORS.green).toBe(0x16f08a);
    expect(COLORS.red).toBe(0xff3b47);
    expect(COLORS.gold).toBe(0xe8b84b);
    expect(COLORS.cyan).toBe(0x36e6ff);
    expect(COLORS.magenta).toBe(0xff45c8);
  });
});

describe('material recipe (ARTBIBLE.md)', () => {
  it('matte is flat-shaded, rough, near-zero metalness', () => {
    const m = matte(COLORS.wall);
    expect(m.flatShading).toBe(true);
    expect(m.roughness).toBe(0.85);
    expect(m.metalness).toBe(0.05);
    expect(m.color.getHex()).toBe(0x0e1719);
  });

  it('neon is a dark base with a bright emissive in the bloom range', () => {
    const n = neon(COLORS.cyan);
    expect(n.flatShading).toBe(true);
    expect(n.color.getHex()).toBe(COLORS.neonBase);
    expect(n.emissive.getHex()).toBe(0x36e6ff);
    expect(n.emissiveIntensity).toBeGreaterThanOrEqual(2.2);
    expect(n.emissiveIntensity).toBeLessThanOrEqual(2.6);
  });
});
