/**
 * Weapon SKINS catalog (Part B) — a data-driven, cosmetic-only skin system in the
 * spirit of Roblox Rivals: many skins per weapon, escalating visual flair by
 * rarity, expressed as PROCEDURAL material treatments (no per-skin textures) so
 * new skins are cheap to add — adding a skin is one catalog entry here.
 *
 * PURELY COSMETIC. A skin carries only presentation metadata; nothing in the
 * match, hit detection, weapon stats, or economy outcome depends on it. Ownership
 * is server-authoritative (you can only equip what you own), but a skin can never
 * grant a gameplay advantage — at most it changes how your own gun looks to you
 * and a colour others see.
 */

import type { WeaponId } from './config';
import { WEAPON_IDS } from './config';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Exotic';

/** Procedural finish treatments (shader/material-driven, no per-skin textures). */
export type Finish =
  | 'matte'
  | 'metallic'
  | 'chrome'
  | 'gold'
  | 'gradient'
  | 'two_tone'
  | 'camo'
  | 'animated';

export type SkinAnim = 'pulse' | 'flow' | 'rainbow';
export type SkinParticle = 'none' | 'sparkle' | 'flame' | 'aura';

export interface WeaponSkin {
  id: string;
  weapon: WeaponId;
  name: string;
  rarity: Rarity;
  base: string; // primary body colour (hex)
  secondary: string; // accent / secondary colour (hex)
  finish: Finish;
  emissive?: boolean; // glowing accent parts (sights/rails/trim)
  emissiveColor?: string; // emissive hue (defaults to secondary)
  anim?: SkinAnim; // animated emissive shader treatment
  particle?: SkinParticle; // showpiece effect (Legendary/Exotic)
}

export interface RarityMeta {
  label: string;
  color: string; // signature UI border/label colour
  order: number;
  price: number; // DEMO-currency cost to unlock
}

/** Rarity → signature colour + DEMO price (Common is free). */
export const RARITY: Record<Rarity, RarityMeta> = {
  Common: { label: 'Common', color: '#9aa7b0', order: 0, price: 0 },
  Uncommon: { label: 'Uncommon', color: '#3fbf6b', order: 1, price: 150 },
  Rare: { label: 'Rare', color: '#3f8efc', order: 2, price: 400 },
  Epic: { label: 'Epic', color: '#a35bff', order: 3, price: 900 },
  Legendary: { label: 'Legendary', color: '#f5b73d', order: 4, price: 2000 },
  Exotic: { label: 'Exotic', color: '#ff4dd2', order: 5, price: 5000 },
};

export const RARITY_ORDER: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Exotic'];

export function skinPrice(skin: WeaponSkin): number {
  return RARITY[skin.rarity].price;
}

export function rarityColor(rarity: Rarity): string {
  return RARITY[rarity].color;
}

// --- Catalog ---------------------------------------------------------------
// Compact builder so the catalog reads as data. Each weapon gets a spread across
// the rarity ladder, including an animated Legendary and an Exotic showpiece.

interface SkinSpec {
  key: string;
  name: string;
  rarity: Rarity;
  base: string;
  secondary: string;
  finish: Finish;
  emissive?: boolean;
  emissiveColor?: string;
  anim?: SkinAnim;
  particle?: SkinParticle;
}

function mk(weapon: WeaponId, s: SkinSpec): WeaponSkin {
  return {
    id: `${weapon}_${s.key}`,
    weapon,
    name: s.name,
    rarity: s.rarity,
    base: s.base,
    secondary: s.secondary,
    finish: s.finish,
    emissive: s.emissive,
    emissiveColor: s.emissiveColor,
    anim: s.anim,
    particle: s.particle,
  };
}

// A shared 6-rung ladder applied to every weapon (distinct colourways per rung).
// The first entry (Common, matte, free) is each weapon's default/owned skin.
const LADDER: SkinSpec[] = [
  { key: 'standard', name: 'Standard Issue', rarity: 'Common', base: '#3a4754', secondary: '#2bd96b', finish: 'matte' },
  { key: 'sandstorm', name: 'Sandstorm', rarity: 'Uncommon', base: '#c7b283', secondary: '#5a4a32', finish: 'two_tone' },
  { key: 'forest', name: 'Forest Camo', rarity: 'Rare', base: '#5c6b3a', secondary: '#2f3a22', finish: 'camo', emissive: false },
  { key: 'cobalt', name: 'Cobalt Surge', rarity: 'Epic', base: '#21508f', secondary: '#36e6ff', finish: 'metallic', emissive: true, emissiveColor: '#36e6ff' },
  { key: 'goldrush', name: 'Gold Rush', rarity: 'Legendary', base: '#caa23a', secondary: '#fff0b0', finish: 'gold', emissive: true, emissiveColor: '#ffd24a', anim: 'pulse', particle: 'sparkle' },
  { key: 'prismatic', name: 'Prismatic', rarity: 'Exotic', base: '#5a3a8f', secondary: '#ff4dd2', finish: 'animated', emissive: true, emissiveColor: '#ff4dd2', anim: 'rainbow', particle: 'aura' },
];

// A couple of weapon-flavoured extras so the locker reads richer than 6/wpn.
const EXTRAS: Partial<Record<WeaponId, SkinSpec[]>> = {
  assault: [
    { key: 'crimson', name: 'Crimson Flux', rarity: 'Epic', base: '#7a1f29', secondary: '#ff4d4d', finish: 'gradient', emissive: true, emissiveColor: '#ff4d4d', anim: 'flow' },
    { key: 'chrome', name: 'Chromebreaker', rarity: 'Rare', base: '#d7dee3', secondary: '#9aa7b0', finish: 'chrome' },
  ],
  smg: [
    { key: 'neonwave', name: 'Neon Wave', rarity: 'Epic', base: '#2a2150', secondary: '#36e6ff', finish: 'gradient', emissive: true, emissiveColor: '#36e6ff', anim: 'flow' },
  ],
  sniper: [
    { key: 'frostline', name: 'Frostline', rarity: 'Epic', base: '#2b5a6e', secondary: '#bdf0ff', finish: 'metallic', emissive: true, emissiveColor: '#bdf0ff' },
    { key: 'inferno', name: 'Inferno', rarity: 'Legendary', base: '#3a1208', secondary: '#ff7a1c', finish: 'animated', emissive: true, emissiveColor: '#ff7a1c', anim: 'pulse', particle: 'flame' },
  ],
  shotgun: [
    { key: 'toxic', name: 'Toxic', rarity: 'Epic', base: '#28401e', secondary: '#9bff3d', finish: 'metallic', emissive: true, emissiveColor: '#9bff3d' },
  ],
  pistol: [
    { key: 'rosegold', name: 'Rose Gold', rarity: 'Rare', base: '#caa', secondary: '#e8b8b0', finish: 'chrome' },
  ],
  lmg: [
    { key: 'warpaint', name: 'War Paint', rarity: 'Epic', base: '#4a3520', secondary: '#ff8a3d', finish: 'camo', emissive: true, emissiveColor: '#ff8a3d' },
  ],
  marksman: [
    { key: 'voidlance', name: 'Void Lance', rarity: 'Legendary', base: '#1c1430', secondary: '#a855f7', finish: 'animated', emissive: true, emissiveColor: '#a855f7', anim: 'flow', particle: 'aura' },
  ],
};

export const WEAPON_SKINS: WeaponSkin[] = WEAPON_IDS.flatMap((w) => [
  ...LADDER.map((s) => mk(w, s)),
  ...(EXTRAS[w] ?? []).map((s) => mk(w, s)),
]);

const BY_ID = new Map(WEAPON_SKINS.map((s) => [s.id, s]));

export function weaponSkinById(id: string): WeaponSkin | undefined {
  return BY_ID.get(id);
}

export function skinsForWeapon(weapon: WeaponId): WeaponSkin[] {
  return WEAPON_SKINS.filter((s) => s.weapon === weapon).sort(
    (a, b) => RARITY[a.rarity].order - RARITY[b.rarity].order,
  );
}

/** The free Common default skin for a weapon (always owned). */
export function defaultSkinFor(weapon: WeaponId): WeaponSkin {
  return weaponSkinById(`${weapon}_standard`)!;
}

/** Skin ids every account owns for free (one Common per weapon). */
export const DEFAULT_OWNED_SKINS: string[] = WEAPON_IDS.map((w) => `${w}_standard`);

/** The default equipped loadout (weapon → skin id). */
export function defaultLoadout(): Record<WeaponId, string> {
  const out = {} as Record<WeaponId, string>;
  for (const w of WEAPON_IDS) out[w] = `${w}_standard`;
  return out;
}
