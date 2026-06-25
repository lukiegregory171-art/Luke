/**
 * Applies a cosmetic skin (an accent colour theme) by setting CSS variables, and
 * remembers the choice in localStorage. Purely visual.
 */

import { DEFAULT_SKIN, skinById, type Skin } from '@liquidate/shared';

const KEY = 'liquidate_skin';

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applySkin(skin: Skin): void {
  const root = document.documentElement.style;
  root.setProperty('--accent', skin.color);
  root.setProperty('--accent-dim', hexToRgba(skin.color, 0.55));
  localStorage.setItem(KEY, skin.id);
}

export function savedSkin(): Skin {
  return skinById(localStorage.getItem(KEY) ?? '') ?? DEFAULT_SKIN;
}
