/**
 * Cosmetic skins (accent colour themes). PURELY VISUAL — nothing in the match or
 * economy depends on these. Some skins are free; others are "unlocked" by holding
 * a Solana DEVNET token (M5, behind a feature flag). There is no real value, no
 * wagering, and no mainnet involvement — devnet tokens are worthless test tokens.
 */

export interface Skin {
  id: string;
  name: string;
  color: string; // CSS accent colour
  /** Devnet token balance required to unlock (0 = always free). */
  requires: number;
}

export const SKINS: Skin[] = [
  { id: 'liquid', name: 'Liquid', color: '#16e0a3', requires: 0 },
  { id: 'ice', name: 'Ice', color: '#38bdf8', requires: 0 },
  { id: 'ember', name: 'Ember', color: '#ff8a3d', requires: 1 },
  { id: 'gold', name: 'Gold', color: '#f5c542', requires: 10 },
  { id: 'void', name: 'Void', color: '#a855f7', requires: 100 },
];

export const DEFAULT_SKIN = SKINS[0];

export function skinById(id: string): Skin | undefined {
  return SKINS.find((s) => s.id === id);
}

/** Whether a skin is unlocked at the given devnet token balance. */
export function isSkinUnlocked(skin: Skin, tokenBalance: number): boolean {
  return skin.requires === 0 || tokenBalance >= skin.requires;
}

/** All skins unlocked at the given devnet token balance. */
export function unlockedSkins(tokenBalance: number): Skin[] {
  return SKINS.filter((s) => isSkinUnlocked(s, tokenBalance));
}
