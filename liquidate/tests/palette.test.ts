/**
 * The restyle locks the BRIGHT ARCADE visual direction (ARTBIBLE.md). This pins
 * the exact palette and the matte/solid material recipe so the look can't
 * silently drift, and confirms the solid helper is a flat self-lit colour with
 * NO bloom-range emissive (there is no bloom pass). Purely cosmetic data — none
 * of it can touch a hitbox or outcome.
 */

import { describe, expect, it } from 'vitest';
import { COLORS, matte, solid } from '../client/src/palette';

describe('locked palette (ARTBIBLE.md — bright arcade)', () => {
  it('pins the exact hex values', () => {
    expect(COLORS.sky).toBe(0xbfe3f2);
    expect(COLORS.horizon).toBe(0xeaf6fb);
    expect(COLORS.surface).toBe(0xf2f4f5);
    expect(COLORS.surface2).toBe(0xc9d1d4);
    expect(COLORS.green).toBe(0x2bd96b);
    expect(COLORS.red).toBe(0xff4d4d);
    expect(COLORS.gold).toBe(0xe8b84b);
    expect(COLORS.skyBlue).toBe(0x4fc3f7);
    expect(COLORS.grass).toBe(0x7cc96b);
    expect(COLORS.sand).toBe(0xe6d9a8);
    expect(COLORS.coral).toBe(0xff8a5c);
  });
});

describe('material recipe (ARTBIBLE.md — bright arcade)', () => {
  it('matte is flat-shaded, rough, zero metalness', () => {
    const m = matte(COLORS.wall);
    expect(m.flatShading).toBe(true);
    expect(m.roughness).toBe(0.95);
    expect(m.metalness).toBe(0);
    expect(m.color.getHex()).toBe(COLORS.wall);
  });

  it('solid is a bright flat colour with only a faint self-illumination (no bloom)', () => {
    const s = solid(COLORS.green);
    expect(s.flatShading).toBe(true);
    expect(s.color.getHex()).toBe(COLORS.green);
    expect(s.emissive.getHex()).toBe(COLORS.green);
    // Tiny emissive to keep saturated hues readable in shadow — nowhere near a
    // bloom threshold (the pipeline has no bloom pass at all).
    expect(s.emissiveIntensity).toBeLessThan(0.5);
    expect(s.metalness).toBe(0);
  });
});
