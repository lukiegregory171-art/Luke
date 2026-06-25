/**
 * Real GLB weapon slot (Part: weapons). The viewmodel/inspect use a real CC0
 * model for archetypes listed in WEAPON_GLB and the procedural model otherwise —
 * a purely cosmetic, data-driven choice. This guards that the mapping is valid
 * (real weapon ids → registered assets) and that the gameplay weapon config is
 * unaffected by which model is shown (stats/hitboxes never depend on art).
 */

import { describe, expect, it } from 'vitest';
import { WEAPONS, WEAPON_IDS } from '@liquidate/shared';
import { WEAPON_GLB } from '../client/src/weaponmodel';
import { MANIFEST } from '../client/src/manifest';

describe('GLB weapon slot', () => {
  it('maps only valid weapon ids to registered, weapon-category assets', () => {
    const byId = new Map(MANIFEST.map((e) => [e.id, e]));
    for (const [id, cfg] of Object.entries(WEAPON_GLB)) {
      expect(WEAPON_IDS).toContain(id);
      const entry = byId.get(cfg.asset);
      expect(entry).toBeDefined();
      expect(entry!.category).toBe('weapon');
      expect(cfg.length).toBeGreaterThan(0);
    }
  });

  it('the gameplay weapon config carries no model/visual field', () => {
    for (const id of WEAPON_IDS) {
      expect('model' in WEAPONS[id]).toBe(false);
    }
    // GLB-backed weapons keep their exact data-defined stats (art ≠ balance).
    expect(WEAPONS.assault.damage).toBe(25);
    expect(WEAPONS.pistol.damage).toBe(22);
  });
});
