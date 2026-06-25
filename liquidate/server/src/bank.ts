/**
 * The demo economy — PLAY-MONEY ONLY. Integer "DEMO" credits in SQLite. There is
 * no real money, custody, fiat, or token anywhere here; this models a
 * stake/pot/rake economy so the UX can be built and reasoned about.
 *
 * The server is the sole authority over balances. Every balance change is
 * written to an append-only `ledger`, so the books can be reconciled: the sum of
 * all ledger deltas always equals the sum of all balances (accounts + treasury),
 * because balances only ever change alongside a ledger entry, starting from 0.
 *
 * Match flow conserves money (the only thing that "moves" out is the rake, into
 * the treasury). Demo deposit/withdraw deliberately mint/burn DEMO credits (with
 * a fee to the treasury) purely to visualise funding/cash-out.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_OWNED_SKINS,
  DEPOSIT_FEE_BPS,
  STARTING_BALANCE,
  WITHDRAW_FEE_BPS,
  bpsOf,
  defaultLoadout,
  rakeOf,
  skinPrice,
  weaponSkinById,
  type WeaponId,
} from '@liquidate/shared';

const TREASURY = 'TREASURY';

export interface Account {
  id: string;
  handle: string;
  balance: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
}

export interface SettleResult {
  pot: number;
  rake: number;
  credit: number; // amount credited to the winner (pot - rake)
}

export class Bank {
  private readonly db: Database.Database;

  constructor(path = ':memory:') {
    // Ensure the DB's directory exists (better-sqlite3 won't create it), so a
    // fresh run with the default `data/…` path doesn't crash on first boot.
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        balance INTEGER NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        owned_skins TEXT NOT NULL DEFAULT '[]',
        loadout TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS treasury (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        account TEXT NOT NULL,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        memo TEXT
      );
      INSERT OR IGNORE INTO treasury (id, balance) VALUES (1, 0);
    `);
    // Migrate older account tables that predate the cosmetics columns.
    this.ensureColumn('accounts', 'owned_skins', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('accounts', 'loadout', "TEXT NOT NULL DEFAULT '{}'");
  }

  /** Add a column if it doesn't already exist (idempotent schema migration). */
  private ensureColumn(table: string, column: string, decl: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
  }

  /** Create or load an account by handle, granting the starting balance once. */
  loginOrCreate(rawHandle: string): Account {
    const handle = rawHandle.trim().slice(0, 24) || 'player';
    const existing = this.db.prepare('SELECT * FROM accounts WHERE handle = ?').get(handle) as
      | Account
      | undefined;
    if (existing) return existing;

    const id = randomUUID();
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO accounts (id, handle, balance, created_at) VALUES (?, ?, ?, ?)')
        .run(id, handle, STARTING_BALANCE, Date.now());
      this.ledger('open', id, STARTING_BALANCE, STARTING_BALANCE, 'account opened');
    })();
    return this.get(id)!;
  }

  get(id: string): Account | undefined {
    return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
  }

  treasury(): number {
    const row = this.db.prepare('SELECT balance FROM treasury WHERE id = 1').get() as {
      balance: number;
    };
    return row.balance;
  }

  /** Debit a player's stake at match start (held as the pot until settled). */
  escrow(id: string, stake: number): void {
    if (stake <= 0) return;
    this.db.transaction(() => {
      const acct = this.get(id);
      if (!acct || acct.balance < stake) throw new Error('insufficient balance for stake');
      this.credit(id, -stake, 'stake', 'match escrow');
    })();
  }

  /** Refund a stake if a match ends with no winner. */
  refund(id: string, stake: number): void {
    if (stake <= 0) return;
    this.db.transaction(() => this.credit(id, stake, 'refund', 'match refund'))();
  }

  /**
   * Settle a finished match: winner is credited pot - rake, the rake goes to the
   * treasury, and both players' stats are updated. Both stakes were already
   * escrowed, so the loser's balance does not change here.
   */
  settle(
    winnerId: string,
    loserId: string,
    stake: number,
    winnerScore: number,
    loserScore: number,
  ): SettleResult {
    const pot = stake * 2;
    const rake = rakeOf(pot);
    const credit = pot - rake;
    this.db.transaction(() => {
      if (stake > 0) {
        this.credit(winnerId, credit, 'win', 'match payout');
        this.treasuryAdd(rake, 'rake', 'match rake');
      }
      this.bumpStats(winnerId, { wins: 1, kills: winnerScore, deaths: loserScore });
      this.bumpStats(loserId, { losses: 1, kills: loserScore, deaths: winnerScore });
    })();
    return { pot, rake, credit };
  }

  /** Demo deposit: mints `amount` DEMO (net to the account, fee to treasury). */
  deposit(id: string, amount: number): { net: number; fee: number } {
    const amt = Math.max(0, Math.floor(amount));
    const fee = bpsOf(amt, DEPOSIT_FEE_BPS);
    const net = amt - fee;
    this.db.transaction(() => {
      this.credit(id, net, 'deposit', 'demo deposit');
      this.treasuryAdd(fee, 'deposit_fee', 'demo deposit fee');
    })();
    return { net, fee };
  }

  /** Demo withdraw: burns `amount` from the account (fee to treasury). */
  withdraw(id: string, amount: number): { fee: number; ok: boolean } {
    const amt = Math.max(0, Math.floor(amount));
    const acct = this.get(id);
    if (!acct || acct.balance < amt || amt <= 0) return { fee: 0, ok: false };
    const fee = bpsOf(amt, WITHDRAW_FEE_BPS);
    this.db.transaction(() => {
      this.credit(id, -amt, 'withdraw', 'demo withdraw');
      this.treasuryAdd(fee, 'withdraw_fee', 'demo withdraw fee');
    })();
    return { fee, ok: true };
  }

  // --- Cosmetics (server-authoritative ownership, DEMO currency) ------------

  /** Skin ids this account owns — the free defaults are always implicitly owned. */
  ownedSkins(id: string): string[] {
    const row = this.db.prepare('SELECT owned_skins FROM accounts WHERE id = ?').get(id) as
      | { owned_skins: string }
      | undefined;
    const bought = row ? (safeParse<string[]>(row.owned_skins, []) ?? []) : [];
    return Array.from(new Set([...DEFAULT_OWNED_SKINS, ...bought]));
  }

  /** Equipped skin per weapon (defaults fill any unset/invalid slot). */
  loadout(id: string): Record<WeaponId, string> {
    const row = this.db.prepare('SELECT loadout FROM accounts WHERE id = ?').get(id) as
      | { loadout: string }
      | undefined;
    const saved = row ? (safeParse<Record<string, string>>(row.loadout, {}) ?? {}) : {};
    const out = defaultLoadout();
    const owned = new Set(this.ownedSkins(id));
    for (const [weapon, skinId] of Object.entries(saved)) {
      const s = weaponSkinById(skinId);
      // Only honour a saved choice that is a real, owned skin for that weapon.
      if (s && s.weapon === weapon && owned.has(skinId)) out[weapon as WeaponId] = skinId;
    }
    return out;
  }

  /** Purchase a skin with DEMO credits (price → treasury). Server-validated. */
  buySkin(id: string, skinId: string): { ok: boolean; reason?: string } {
    const skin = weaponSkinById(skinId);
    if (!skin) return { ok: false, reason: 'unknown skin' };
    if (this.ownedSkins(id).includes(skinId)) return { ok: false, reason: 'already owned' };
    const price = skinPrice(skin);
    const acct = this.get(id);
    if (!acct) return { ok: false, reason: 'no account' };
    if (acct.balance < price) return { ok: false, reason: 'insufficient balance' };
    this.db.transaction(() => {
      if (price > 0) {
        this.credit(id, -price, 'skin_buy', `buy ${skinId}`);
        this.treasuryAdd(price, 'skin_revenue', `skin ${skinId}`);
      }
      const owned = this.ownedSkins(id);
      owned.push(skinId);
      this.db
        .prepare('UPDATE accounts SET owned_skins = ? WHERE id = ?')
        .run(JSON.stringify(Array.from(new Set(owned))), id);
    })();
    return { ok: true };
  }

  /** Equip an OWNED skin for its weapon. Cosmetic-only; rejects unowned skins. */
  equipSkin(id: string, weapon: WeaponId, skinId: string): { ok: boolean; reason?: string } {
    const skin = weaponSkinById(skinId);
    if (!skin || skin.weapon !== weapon) return { ok: false, reason: 'invalid skin for weapon' };
    if (!this.ownedSkins(id).includes(skinId)) return { ok: false, reason: 'not owned' };
    const next = this.loadout(id);
    next[weapon] = skinId;
    this.db.prepare('UPDATE accounts SET loadout = ? WHERE id = ?').run(JSON.stringify(next), id);
    return { ok: true };
  }

  /**
   * Books check: the sum of every ledger delta must equal the sum of all
   * balances (accounts + treasury). True unless a balance was changed without a
   * matching ledger entry.
   */
  reconcile(): { ok: boolean; ledgerSum: number; balanceSum: number } {
    const ledgerSum = (
      this.db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM ledger').get() as { s: number }
    ).s;
    const accounts = (
      this.db.prepare('SELECT COALESCE(SUM(balance), 0) AS s FROM accounts').get() as { s: number }
    ).s;
    const balanceSum = accounts + this.treasury();
    return { ok: ledgerSum === balanceSum, ledgerSum, balanceSum };
  }

  close(): void {
    this.db.close();
  }

  // --- internals (call inside a transaction) --------------------------------

  private credit(id: string, delta: number, type: string, memo: string): void {
    this.db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, id);
    const acct = this.get(id);
    if (!acct) throw new Error(`no such account ${id}`);
    this.ledger(type, id, delta, acct.balance, memo);
  }

  private treasuryAdd(delta: number, type: string, memo: string): void {
    if (delta === 0) return;
    this.db.prepare('UPDATE treasury SET balance = balance + ? WHERE id = 1').run(delta);
    this.ledger(type, TREASURY, delta, this.treasury(), memo);
  }

  private bumpStats(
    id: string,
    d: { wins?: number; losses?: number; kills?: number; deaths?: number },
  ): void {
    this.db
      .prepare(
        'UPDATE accounts SET wins = wins + ?, losses = losses + ?, kills = kills + ?, deaths = deaths + ? WHERE id = ?',
      )
      .run(d.wins ?? 0, d.losses ?? 0, d.kills ?? 0, d.deaths ?? 0, id);
  }

  private ledger(
    type: string,
    account: string,
    delta: number,
    balanceAfter: number,
    memo: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO ledger (ts, type, account, delta, balance_after, memo) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(Date.now(), type, account, delta, balanceAfter, memo);
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
