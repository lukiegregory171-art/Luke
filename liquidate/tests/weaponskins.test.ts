/**
 * Weapon SKINS system (Part B): catalog integrity, the cosmetic-only invariant
 * (skins/models can NEVER change stats or hit detection), and server-authoritative
 * ownership (you can only equip skins you own; buying is a validated DEMO-currency
 * transaction that keeps the books balanced).
 */

import { describe, expect, it } from 'vitest';
import {
  BODY_SPHERE,
  DEFAULT_OWNED_SKINS,
  HEAD_SPHERE,
  RARITY,
  WEAPONS,
  WEAPON_IDS,
  WEAPON_SKINS,
  defaultLoadout,
  defaultSkinFor,
  hurtboxes,
  skinPrice,
  skinsForWeapon,
  weaponSkinById,
} from '@liquidate/shared';
import { Bank } from '../server/src/bank';

describe('weapon-skins catalog', () => {
  it('gives every weapon a populated rarity spread incl. Legendary + Exotic', () => {
    for (const w of WEAPON_IDS) {
      const skins = skinsForWeapon(w);
      expect(skins.length).toBeGreaterThanOrEqual(5);
      const rarities = new Set(skins.map((s) => s.rarity));
      expect(rarities.has('Legendary')).toBe(true);
      expect(rarities.has('Exotic')).toBe(true);
      // At least one animated showpiece (Legendary/Exotic).
      expect(skins.some((s) => s.finish === 'animated' || s.anim)).toBe(true);
    }
  });

  it('default skin per weapon is a free Common owned by everyone', () => {
    for (const w of WEAPON_IDS) {
      const d = defaultSkinFor(w);
      expect(d.weapon).toBe(w);
      expect(d.rarity).toBe('Common');
      expect(skinPrice(d)).toBe(0);
      expect(DEFAULT_OWNED_SKINS).toContain(d.id);
      expect(defaultLoadout()[w]).toBe(d.id);
    }
  });

  it('skin ids are unique and resolvable; rarity prices climb the ladder', () => {
    const ids = WEAPON_SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of WEAPON_SKINS) expect(weaponSkinById(s.id)).toBe(s);
    expect(RARITY.Common.price).toBe(0);
    expect(RARITY.Exotic.price).toBeGreaterThan(RARITY.Legendary.price);
    expect(RARITY.Legendary.price).toBeGreaterThan(RARITY.Rare.price);
  });
});

describe('skins are cosmetic-only — never affect stats or hits', () => {
  it('a WeaponSkin carries only presentation fields (no stat fields)', () => {
    const banned = [
      'damage',
      'range',
      'fireInterval',
      'magazine',
      'pellets',
      'spread',
      'headshotMultiplier',
      'reloadTime',
      'health',
      'radius',
    ];
    for (const s of WEAPON_SKINS) for (const k of banned) expect(k in s).toBe(false);
  });

  it('hitboxes and weapon stats are independent of any skin', () => {
    // hurtboxes() is a pure function of feet position — there is no skin param,
    // so a skin (or model) cannot move a hitbox. Same input → identical boxes.
    expect(hurtboxes({ x: 1, y: 0, z: 2 })).toEqual(hurtboxes({ x: 1, y: 0, z: 2 }));
    expect(BODY_SPHERE).toEqual({ centerY: 1.0, radius: 0.45 });
    expect(HEAD_SPHERE).toEqual({ centerY: 1.65, radius: 0.22 });
    // Weapon configs hold no skin reference, so equipping can't change a stat.
    expect(WEAPONS.assault.damage).toBe(25);
    expect('skin' in WEAPONS.assault).toBe(false);
  });
});

describe('server-authoritative skin ownership', () => {
  it('cannot equip an unowned skin; can after buying it', () => {
    const bank = new Bank(':memory:');
    const acct = bank.loginOrCreate('skinz');
    const target = WEAPON_SKINS.find(
      (s) => s.weapon === 'assault' && s.rarity === 'Uncommon' && skinPrice(s) > 0,
    )!;

    // Not owned → equip is rejected and the loadout stays on the default.
    expect(bank.ownedSkins(acct.id)).not.toContain(target.id);
    expect(bank.equipSkin(acct.id, 'assault', target.id).ok).toBe(false);
    expect(bank.loadout(acct.id).assault).toBe('assault_standard');

    // Buy it: balance is debited by exactly the price and the books still balance.
    const before = bank.get(acct.id)!.balance;
    expect(bank.buySkin(acct.id, target.id).ok).toBe(true);
    expect(bank.get(acct.id)!.balance).toBe(before - skinPrice(target));
    expect(bank.ownedSkins(acct.id)).toContain(target.id);
    expect(bank.reconcile().ok).toBe(true);

    // Now equip succeeds and persists.
    expect(bank.equipSkin(acct.id, 'assault', target.id).ok).toBe(true);
    expect(bank.loadout(acct.id).assault).toBe(target.id);
    bank.close();
  });

  it('rejects buying beyond balance and equipping to the wrong weapon', () => {
    const bank = new Bank(':memory:');
    const acct = bank.loginOrCreate('broke');
    const exotic = WEAPON_SKINS.find((s) => s.weapon === 'smg' && s.rarity === 'Exotic')!;

    // Starting balance is below the Exotic price → purchase fails, nothing granted.
    expect(bank.get(acct.id)!.balance).toBeLessThan(skinPrice(exotic));
    expect(bank.buySkin(acct.id, exotic.id).ok).toBe(false);
    expect(bank.ownedSkins(acct.id)).not.toContain(exotic.id);

    // A default skin is owned, but equipping it to the wrong weapon is rejected.
    expect(bank.equipSkin(acct.id, 'sniper', 'assault_standard').ok).toBe(false);
    expect(bank.reconcile().ok).toBe(true);
    bank.close();
  });
});
