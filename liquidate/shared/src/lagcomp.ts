/**
 * Lag-compensation history sampling (pure). The server records each player's
 * recent feet positions with timestamps; to "favor the shooter", a shot is
 * resolved against where the target was at the shooter's view time (now minus
 * the shooter's latency + interpolation delay), found by interpolating this
 * history.
 *
 * LIMITATION: lag compensation makes hit detection fair across latency, but it
 * does NOT detect or prevent aimbots — a cheater that aims perfectly still sends
 * "legal" inputs. See the anti-cheat note in the server.
 */

export interface HistorySample {
  t: number; // server time (ms)
  x: number;
  z: number;
}

/** Position at `time` by interpolating the history; clamps to the ends. */
export function sampleHistory(
  history: HistorySample[],
  time: number,
): { x: number; z: number } | null {
  const n = history.length;
  if (n === 0) return null;
  if (time <= history[0].t) return { x: history[0].x, z: history[0].z };
  const last = history[n - 1];
  if (time >= last.t) return { x: last.x, z: last.z };

  for (let i = 0; i < n - 1; i++) {
    const a = history[i];
    const b = history[i + 1];
    if (a.t <= time && time <= b.t) {
      const span = b.t - a.t || 1;
      const f = (time - a.t) / span;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return { x: last.x, z: last.z };
}
