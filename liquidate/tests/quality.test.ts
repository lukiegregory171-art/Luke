/**
 * P7 first-run quality auto-detection. detectQuality is a pure heuristic that
 * errs toward a smooth frame rate on weak hardware and never auto-selects ultra
 * (that stays an explicit opt-in). The renderer also has dynamic resolution +
 * pooling, so this is just a sensible starting point, not a hard cap.
 */

import { describe, expect, it } from 'vitest';
import { detectQuality } from '../client/src/quality';

describe('detectQuality (P7)', () => {
  it('drops weak / mobile devices to low', () => {
    expect(detectQuality({ cores: 8, dpr: 3, mobile: true })).toBe('low');
    expect(detectQuality({ cores: 2, dpr: 1, mobile: false })).toBe('low');
  });

  it('uses medium for modest desktops or very high-DPR screens', () => {
    expect(detectQuality({ cores: 4, dpr: 1, mobile: false })).toBe('medium');
    expect(detectQuality({ cores: 8, dpr: 3, mobile: false })).toBe('medium');
  });

  it('uses high for capable desktops', () => {
    expect(detectQuality({ cores: 8, dpr: 1.5, mobile: false })).toBe('high');
    expect(detectQuality({ cores: 12, dpr: 2, mobile: false })).toBe('high');
  });

  it('never auto-selects ultra', () => {
    const levels = [
      detectQuality({ cores: 2, dpr: 1, mobile: false }),
      detectQuality({ cores: 4, dpr: 1, mobile: false }),
      detectQuality({ cores: 16, dpr: 1, mobile: false }),
      detectQuality({ cores: 32, dpr: 4, mobile: true }),
    ];
    expect(levels).not.toContain('ultra');
  });
});
