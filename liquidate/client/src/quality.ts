/**
 * Graphics quality presets. Purely client-side rendering knobs — none of this
 * touches gameplay, hitboxes, or authority. Presets scale render resolution,
 * shadows, and which post-processing effects run; "high" targets 60fps at 1080p
 * on mid-range hardware, "low" strips effects for weak devices.
 */

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  maxPixelRatio: number; // cap on devicePixelRatio
  shadows: boolean;
  shadowMapSize: number;
  smaa: boolean; // light anti-aliasing (MSAA samples on the render target)
  dynamicResolution: boolean; // auto-scale render res to hold frame rate
}

// The bright arcade pipeline is intentionally lean — no bloom/SSAO/vignette/grain.
// Presets only scale render resolution, shadows, and anti-aliasing.
export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    smaa: false,
    dynamicResolution: true,
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    smaa: true,
    dynamicResolution: true,
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    smaa: true,
    dynamicResolution: true,
  },
  ultra: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    smaa: true,
    dynamicResolution: false,
  },
};

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

const KEY = 'liquidate_quality';

/** Coarse device capabilities used to pick a sane first-run quality (P7). */
export interface DeviceCaps {
  cores: number; // navigator.hardwareConcurrency
  dpr: number; // devicePixelRatio
  mobile: boolean;
}

/**
 * Pick a starting quality for a device with no saved preference (P7). Errs
 * toward smooth: weak/mobile → low, modest → medium, otherwise high. Never
 * auto-selects ultra (that stays an explicit opt-in). Pure + unit-tested.
 */
export function detectQuality(caps: DeviceCaps): QualityLevel {
  if (caps.mobile || caps.cores <= 2) return 'low';
  if (caps.cores <= 4 || caps.dpr > 2.5) return 'medium';
  return 'high';
}

function currentCaps(): DeviceCaps {
  return {
    cores: navigator.hardwareConcurrency || 4,
    dpr: window.devicePixelRatio || 1,
    mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
  };
}

export function savedQuality(): QualityLevel {
  const v = localStorage.getItem(KEY) as QualityLevel | null;
  return v && v in QUALITY ? v : 'high';
}

/** The saved preference if any, else a device-appropriate auto-detected level. */
export function initialQuality(): QualityLevel {
  const v = localStorage.getItem(KEY) as QualityLevel | null;
  if (v && v in QUALITY) return v;
  return detectQuality(currentCaps());
}

export function saveQuality(level: QualityLevel): void {
  localStorage.setItem(KEY, level);
}
