/**
 * Per-connection session state and helpers for pushing authoritative economy
 * state to a client. A session links a WebSocket connection to a demo account
 * (after login) and remembers the stake it queued with.
 */

import type { Connection } from './connection';
import type { Bank } from './bank';

export interface Session {
  conn: Connection;
  accountId?: string;
  handle?: string;
  stake: number;
  rtt: number; // measured round-trip latency (ms), used by lag compensation
}

export function makeSession(conn: Connection): Session {
  return { conn, stake: 0, rtt: 0 };
}

/** Push the latest authoritative account state to a connection. */
export function sendAccount(conn: Connection, bank: Bank, accountId: string): void {
  const a = bank.get(accountId);
  if (!a) return;
  conn.send({
    type: 'account',
    id: a.id,
    handle: a.handle,
    balance: a.balance,
    wins: a.wins,
    losses: a.losses,
    kills: a.kills,
    deaths: a.deaths,
    owned: bank.ownedSkins(a.id),
    loadout: bank.loadout(a.id),
  });
}

/** Push the current treasury balance to a connection. */
export function sendTreasury(conn: Connection, bank: Bank): void {
  conn.send({ type: 'treasury', balance: bank.treasury() });
}
