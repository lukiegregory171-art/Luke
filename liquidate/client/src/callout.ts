/**
 * Multi-kill + killstreak callouts (presentation). Pure logic so it's testable:
 * rapid kills (within a window) escalate "DOUBLE/TRIPLE/… KILL"; total kills
 * without dying hit "spree" milestones. Cosmetic — the server owns the kills;
 * this just decides what to shout and how loud.
 */

const MULTI_WINDOW_MS = 3500;

/** Label for N kills in quick succession (null below 2). */
export function multiKillLabel(count: number): string | null {
  switch (count) {
    case 2:
      return 'DOUBLE KILL';
    case 3:
      return 'TRIPLE KILL';
    case 4:
      return 'QUAD KILL';
    case 5:
      return 'MEGA KILL';
    default:
      return count >= 6 ? 'MONSTER KILL' : null;
  }
}

/** Label for a killstreak milestone (null off-milestone). */
export function streakLabel(streak: number): string | null {
  switch (streak) {
    case 5:
      return 'KILLING SPREE';
    case 10:
      return 'RAMPAGE';
    case 15:
      return 'UNSTOPPABLE';
    case 20:
      return 'GODLIKE';
    default:
      return null;
  }
}

export interface Callout {
  text: string;
  /** Escalation level (2+ for multi-kills, 1 for a spree) — drives the sound. */
  level: number;
}

/** Tracks a player's multi-kill window + killstreak and emits callouts. */
export class Streaks {
  private multi = 0;
  private lastKill = -Infinity;
  private streak = 0;

  /** Register a kill at `now` (ms). Returns a callout to announce, or null. */
  onKill(now: number): Callout | null {
    this.multi = now - this.lastKill < MULTI_WINDOW_MS ? this.multi + 1 : 1;
    this.lastKill = now;
    this.streak++;

    const multi = multiKillLabel(this.multi);
    if (multi) return { text: multi, level: this.multi };
    const spree = streakLabel(this.streak);
    return spree ? { text: spree, level: 1 } : null;
  }

  /** Death resets both the window and the streak. */
  onDeath(): void {
    this.multi = 0;
    this.streak = 0;
  }

  reset(): void {
    this.multi = 0;
    this.streak = 0;
    this.lastKill = -Infinity;
  }
}
