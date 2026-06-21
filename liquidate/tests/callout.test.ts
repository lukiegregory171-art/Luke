/**
 * Multi-kill + streak callout logic (Phase B presentation). Pure — the server
 * owns kills; this just decides the shout. Rapid kills escalate; a death resets.
 */

import { describe, expect, it } from 'vitest';
import { Streaks, multiKillLabel, streakLabel } from '../client/src/callout';

describe('callout labels', () => {
  it('escalates multi-kills and ignores singles', () => {
    expect(multiKillLabel(1)).toBeNull();
    expect(multiKillLabel(2)).toBe('DOUBLE KILL');
    expect(multiKillLabel(3)).toBe('TRIPLE KILL');
    expect(multiKillLabel(6)).toBe('MONSTER KILL');
    expect(multiKillLabel(99)).toBe('MONSTER KILL');
  });

  it('marks streak milestones only', () => {
    expect(streakLabel(4)).toBeNull();
    expect(streakLabel(5)).toBe('KILLING SPREE');
    expect(streakLabel(10)).toBe('RAMPAGE');
    expect(streakLabel(11)).toBeNull();
  });
});

describe('Streaks', () => {
  it('counts rapid kills as a multi-kill', () => {
    const s = new Streaks();
    expect(s.onKill(1000)).toBeNull(); // first kill: no callout
    const c = s.onKill(1500); // within the window
    expect(c?.text).toBe('DOUBLE KILL');
    expect(c?.level).toBe(2);
  });

  it('resets the multi-kill window after a gap (but the streak grows)', () => {
    const s = new Streaks();
    s.onKill(0);
    expect(s.onKill(9000)).toBeNull(); // > window: back to a single
    // ...keep going to a streak milestone (5 total kills, spaced out).
    s.onKill(20000);
    s.onKill(30000);
    const c = s.onKill(40000);
    expect(c?.text).toBe('KILLING SPREE');
    expect(c?.level).toBe(1);
  });

  it('a death resets the streak', () => {
    const s = new Streaks();
    s.onKill(0);
    s.onKill(20000);
    s.onDeath();
    expect(s.onKill(40000)).toBeNull(); // streak restarted
  });
});
