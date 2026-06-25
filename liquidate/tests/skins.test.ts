/**
 * P4 skins are cosmetic-only and data-driven. These tests lock the anti-pay-to-
 * win properties: a skin carries ONLY presentation metadata (no field that could
 * touch gameplay), the accent converts to a 3D colour, and applying a skin
 * retints client visuals without any path to the server. (The server and wire
 * protocol contain no skin field at all — verified separately — so a skin is
 * physically incapable of affecting a match or the opponent's appearance.)
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SKINS, accentHex, isSkinUnlocked, skinById } from '@liquidate/shared';
import { Weapon } from '../client/src/weapon';

describe('skins (P4, cosmetic-only)', () => {
  it('carry only presentation metadata — no gameplay fields', () => {
    const allowed = new Set(['id', 'name', 'color', 'requires']);
    for (const skin of SKINS) {
      for (const key of Object.keys(skin)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it('unlock gates are cosmetic and never block the free default', () => {
    // The default skin (requires 0) is always available; gating only ever
    // changes which colour you can pick, never anything in the match.
    const free = SKINS.filter((s) => s.requires === 0);
    expect(free.length).toBeGreaterThan(0);
    for (const s of free) expect(isSkinUnlocked(s, 0)).toBe(true);
  });

  it('accentHex converts the CSS colour to a 0xRRGGBB number', () => {
    expect(accentHex(skinById('liquid')!)).toBe(0x16e0a3);
    expect(accentHex(skinById('void')!)).toBe(0xa855f7);
  });

  it('retints the viewmodel accent + tracers, keeping tracers readable', () => {
    const weapon = new Weapon(new THREE.Scene(), new THREE.PerspectiveCamera());
    weapon.setAccent(0xff0000); // pure red skin

    expect(weapon.accent).toBe(0xff0000);

    // Tracers use a lightened accent (lerped toward white) so they read on any
    // skin — red stays maxed but green/blue are lifted.
    const t = weapon.tracerColorHex;
    expect((t >> 16) & 0xff).toBe(255); // red preserved
    expect((t >> 8) & 0xff).toBeGreaterThan(0); // lightened (green added)
    expect(t & 0xff).toBeGreaterThan(0); // lightened (blue added)
  });
});
