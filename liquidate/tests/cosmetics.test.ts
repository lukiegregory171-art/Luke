import { describe, expect, it } from 'vitest';
import { DEFAULT_SKIN, SKINS, isSkinUnlocked, skinById, unlockedSkins } from '@liquidate/shared';

describe('cosmetics (devnet-token gated skins)', () => {
  it('free skins are always unlocked', () => {
    const free = SKINS.filter((s) => s.requires === 0);
    for (const s of free) expect(isSkinUnlocked(s, 0)).toBe(true);
    expect(unlockedSkins(0).map((s) => s.id)).toEqual(free.map((s) => s.id));
  });

  it('token-gated skins unlock at their threshold', () => {
    const gold = skinById('gold')!;
    expect(isSkinUnlocked(gold, gold.requires - 1)).toBe(false);
    expect(isSkinUnlocked(gold, gold.requires)).toBe(true);
  });

  it('a mid balance unlocks the right set', () => {
    const ids = unlockedSkins(10).map((s) => s.id);
    expect(ids).toContain('ember'); // requires 1
    expect(ids).toContain('gold'); // requires 10
    expect(ids).not.toContain('void'); // requires 100
  });

  it('has a sensible default', () => {
    expect(DEFAULT_SKIN.requires).toBe(0);
  });
});
