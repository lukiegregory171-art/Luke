/**
 * M3 weapons are data (config.ts) — a weapon is an entry, not engine code. This
 * checks the 3-weapon slice is well-formed and that the archetypes are actually
 * distinct (assault balanced / SMG fast-weak / sniper slow-lethal), and that
 * `freshMagazines()` stays in sync with the roster. All server-authoritative:
 * these numbers are enforced on the server, never trusted from the client.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSAULT,
  DEFAULT_WEAPON,
  MAX_HEALTH,
  SMG,
  SNIPER,
  WEAPONS,
  WEAPON_IDS,
  freshMagazines,
} from '@liquidate/shared';

describe('weapons (M3, data-driven)', () => {
  it('exposes the weapon roster, indexed by id', () => {
    expect(WEAPON_IDS).toEqual([
      'assault',
      'smg',
      'sniper',
      'shotgun',
      'pistol',
      'lmg',
      'marksman',
    ]);
    for (const id of WEAPON_IDS) expect(WEAPONS[id].id).toBe(id);
    expect(DEFAULT_WEAPON).toBe('assault');
  });

  it('the shotgun is the only multi-pellet weapon (close-range burst)', () => {
    expect(WEAPONS.shotgun.pellets).toBeGreaterThan(1);
    for (const id of WEAPON_IDS) {
      if (id !== 'shotgun') expect(WEAPONS[id].pellets).toBe(1);
    }
  });

  it('every weapon has sane, complete stats', () => {
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.damage).toBeGreaterThan(0);
      expect(w.headshotMultiplier).toBeGreaterThanOrEqual(1);
      expect(w.fireInterval).toBeGreaterThan(0);
      expect(w.magazine).toBeGreaterThan(0);
      expect(w.reloadTime).toBeGreaterThan(0);
      expect(w.range).toBeGreaterThan(0);
      expect(w.pellets).toBeGreaterThanOrEqual(1);
      expect(w.spread).toBeGreaterThanOrEqual(0);
    }
  });

  it('archetypes are genuinely distinct', () => {
    // SMG fires faster than assault, which fires faster than the sniper.
    expect(SMG.fireInterval).toBeLessThan(ASSAULT.fireInterval);
    expect(ASSAULT.fireInterval).toBeLessThan(SNIPER.fireInterval);
    // Sniper hits hardest and reaches furthest; SMG hits softest, shortest.
    expect(SNIPER.damage).toBeGreaterThan(ASSAULT.damage);
    expect(ASSAULT.damage).toBeGreaterThan(SMG.damage);
    expect(SNIPER.range).toBeGreaterThan(SMG.range);
    // Fast TTK: a sniper headshot is lethal in one.
    expect(SNIPER.damage * SNIPER.headshotMultiplier).toBeGreaterThanOrEqual(MAX_HEALTH);
  });

  it('freshMagazines matches the roster', () => {
    const mags = freshMagazines();
    expect(Object.keys(mags).sort()).toEqual([...WEAPON_IDS].sort());
    for (const id of WEAPON_IDS) expect(mags[id]).toBe(WEAPONS[id].magazine);
  });
});
