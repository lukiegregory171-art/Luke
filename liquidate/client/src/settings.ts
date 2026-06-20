/**
 * Player settings (P6): audio volume / mute and mouse sensitivity, persisted to
 * localStorage. The pure helpers (clamping + the sensitivity slider→radians
 * mapping) are exported and unit-tested; the store wraps them with persistence.
 *
 * Client-only preferences — they affect how the game looks/sounds/feels for you,
 * never anything the server decides.
 */

import { clamp } from '@liquidate/shared';

export interface Settings {
  volume: number; // 0..1
  muted: boolean;
  sensitivity: number; // 0..1 slider position
  fov: number; // vertical FOV in degrees
}

export const FOV_MIN = 70;
export const FOV_MAX = 110;
export const DEFAULT_SETTINGS: Settings = { volume: 0.7, muted: false, sensitivity: 0.5, fov: 80 };

// Sensitivity slider maps linearly onto this radians-per-pixel range; the
// default slider (0.5) lands close to the old fixed 0.0022 feel.
const SENS_MIN = 0.0008;
const SENS_MAX = 0.0042;

/** Map a 0..1 slider position to mouse-look radians per pixel. */
export function sensitivityRadians(slider: number): number {
  return SENS_MIN + clamp(slider, 0, 1) * (SENS_MAX - SENS_MIN);
}

/** Merge partial/untrusted input with defaults and clamp into valid ranges. */
export function clampSettings(partial: Partial<Settings>): Settings {
  return {
    volume: clamp(partial.volume ?? DEFAULT_SETTINGS.volume, 0, 1),
    muted: partial.muted ?? DEFAULT_SETTINGS.muted,
    sensitivity: clamp(partial.sensitivity ?? DEFAULT_SETTINGS.sensitivity, 0, 1),
    fov: clamp(partial.fov ?? DEFAULT_SETTINGS.fov, FOV_MIN, FOV_MAX),
  };
}

const KEY = 'liquidate_settings';

export class SettingsStore {
  private s: Settings;

  constructor() {
    this.s = load();
  }

  get volume(): number {
    return this.s.volume;
  }
  set volume(v: number) {
    this.s.volume = clamp(v, 0, 1);
    this.save();
  }

  get muted(): boolean {
    return this.s.muted;
  }
  set muted(m: boolean) {
    this.s.muted = m;
    this.save();
  }

  get sensitivity(): number {
    return this.s.sensitivity;
  }
  set sensitivity(v: number) {
    this.s.sensitivity = clamp(v, 0, 1);
    this.save();
  }

  /** Mouse-look radians per pixel for the current sensitivity slider. */
  get sensitivityRadians(): number {
    return sensitivityRadians(this.s.sensitivity);
  }

  get fov(): number {
    return this.s.fov;
  }
  set fov(v: number) {
    this.s.fov = clamp(v, FOV_MIN, FOV_MAX);
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* storage may be unavailable (private mode); settings just won't persist */
    }
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return clampSettings(JSON.parse(raw) as Partial<Settings>);
  } catch {
    /* ignore malformed/blocked storage */
  }
  return { ...DEFAULT_SETTINGS };
}
