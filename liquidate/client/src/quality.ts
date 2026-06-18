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
  ssao: boolean;
  bloom: boolean;
  smaa: boolean;
  vignette: boolean;
  grain: boolean;
  dynamicResolution: boolean; // auto-scale render res to hold frame rate
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    ssao: false,
    bloom: true,
    smaa: false,
    vignette: false,
    grain: false,
    dynamicResolution: true,
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    ssao: false,
    bloom: true,
    smaa: true,
    vignette: true,
    grain: false,
    dynamicResolution: true,
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    ssao: true,
    bloom: true,
    smaa: true,
    vignette: true,
    grain: true,
    dynamicResolution: true,
  },
  ultra: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    ssao: true,
    bloom: true,
    smaa: true,
    vignette: true,
    grain: true,
    dynamicResolution: false,
  },
};

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

const KEY = 'liquidate_quality';

export function savedQuality(): QualityLevel {
  const v = localStorage.getItem(KEY) as QualityLevel | null;
  return v && v in QUALITY ? v : 'high';
}

export function saveQuality(level: QualityLevel): void {
  localStorage.setItem(KEY, level);
}
