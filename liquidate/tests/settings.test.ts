/**
 * P6 settings: the pure helpers (used by the persisted store) — clamping and the
 * sensitivity slider→radians mapping. These are client preferences only; they
 * change feel/volume, never anything authoritative.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  clampSettings,
  sensitivityRadians,
} from '../client/src/settings';

describe('settings helpers (P6)', () => {
  it('maps the sensitivity slider monotonically into a radians range', () => {
    const lo = sensitivityRadians(0);
    const mid = sensitivityRadians(0.5);
    const hi = sensitivityRadians(1);
    expect(lo).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
    // The default slider lands near the old fixed 0.0022 feel.
    expect(sensitivityRadians(DEFAULT_SETTINGS.sensitivity)).toBeCloseTo(0.0025, 3);
  });

  it('clamps out-of-range slider values', () => {
    expect(sensitivityRadians(-5)).toBe(sensitivityRadians(0));
    expect(sensitivityRadians(99)).toBe(sensitivityRadians(1));
  });

  it('fills defaults and clamps volume/sensitivity into 0..1', () => {
    expect(clampSettings({})).toEqual(DEFAULT_SETTINGS);
    const c = clampSettings({ volume: 5, sensitivity: -2, muted: true });
    expect(c.volume).toBe(1);
    expect(c.sensitivity).toBe(0);
    expect(c.muted).toBe(true);
  });

  it('keeps valid values untouched', () => {
    const c = clampSettings({ volume: 0.3, sensitivity: 0.8, muted: false, fov: 95 });
    expect(c).toEqual({ volume: 0.3, sensitivity: 0.8, muted: false, fov: 95 });
  });

  it('clamps FOV into range', () => {
    expect(clampSettings({ fov: 999 }).fov).toBe(110);
    expect(clampSettings({ fov: 10 }).fov).toBe(70);
  });
});
