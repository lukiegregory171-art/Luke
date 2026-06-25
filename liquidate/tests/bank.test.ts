/**
 * Unit tests for the play-money economy: account creation, demo deposit/withdraw
 * fees, match settlement conservation, stats, and ledger reconciliation. Uses an
 * in-memory SQLite database.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STARTING_BALANCE, rakeOf } from '@liquidate/shared';
import { Bank } from '../server/src/bank';

let bank: Bank;
beforeEach(() => {
  bank = new Bank(':memory:');
});
afterEach(() => {
  bank.close();
});

describe('accounts', () => {
  it('creates an account with the starting balance and is idempotent by handle', () => {
    const a = bank.loginOrCreate('alice');
    expect(a.balance).toBe(STARTING_BALANCE);
    const again = bank.loginOrCreate('alice');
    expect(again.id).toBe(a.id);
    expect(again.balance).toBe(STARTING_BALANCE);
  });
});

describe('demo deposit / withdraw (mint / burn with a fee to treasury)', () => {
  it('deposit credits net and sends the fee to the treasury', () => {
    const a = bank.loginOrCreate('alice');
    const { net, fee } = bank.deposit(a.id, 500); // 2% fee
    expect(fee).toBe(10);
    expect(net).toBe(490);
    expect(bank.get(a.id)!.balance).toBe(STARTING_BALANCE + 490);
    expect(bank.treasury()).toBe(10);
    expect(bank.reconcile().ok).toBe(true);
  });

  it('withdraw debits the account and sends the fee to the treasury', () => {
    const a = bank.loginOrCreate('alice');
    const { ok, fee } = bank.withdraw(a.id, 200); // 2% fee
    expect(ok).toBe(true);
    expect(fee).toBe(4);
    expect(bank.get(a.id)!.balance).toBe(STARTING_BALANCE - 200);
    expect(bank.treasury()).toBe(4);
    expect(bank.reconcile().ok).toBe(true);
  });

  it('refuses to withdraw more than the balance', () => {
    const a = bank.loginOrCreate('alice');
    expect(bank.withdraw(a.id, STARTING_BALANCE + 1).ok).toBe(false);
    expect(bank.get(a.id)!.balance).toBe(STARTING_BALANCE);
  });
});

describe('match settlement', () => {
  it('conserves money: winner +stake-rake, loser -stake, treasury +rake', () => {
    const alice = bank.loginOrCreate('alice');
    const bob = bank.loginOrCreate('bob');
    const stake = 100;
    const treasuryBefore = bank.treasury();

    bank.escrow(alice.id, stake);
    bank.escrow(bob.id, stake);
    expect(bank.get(alice.id)!.balance).toBe(STARTING_BALANCE - stake);
    expect(bank.get(bob.id)!.balance).toBe(STARTING_BALANCE - stake);

    const { pot, rake, credit } = bank.settle(alice.id, bob.id, stake, 3, 1);
    expect(pot).toBe(200);
    expect(rake).toBe(rakeOf(200)); // 1% of 200 = 2
    expect(credit).toBe(pot - rake);

    const aliceNet = bank.get(alice.id)!.balance - STARTING_BALANCE;
    const bobNet = bank.get(bob.id)!.balance - STARTING_BALANCE;
    const treasuryNet = bank.treasury() - treasuryBefore;
    expect(aliceNet).toBe(stake - rake); // winner gains stake minus rake
    expect(bobNet).toBe(-stake); // loser loses the stake
    expect(treasuryNet).toBe(rake); // only the rake moves to the house
    expect(aliceNet + bobNet + treasuryNet).toBe(0); // nothing created or destroyed
  });

  it('updates win/loss and kill/death stats', () => {
    const alice = bank.loginOrCreate('alice');
    const bob = bank.loginOrCreate('bob');
    bank.escrow(alice.id, 50);
    bank.escrow(bob.id, 50);
    bank.settle(alice.id, bob.id, 50, 3, 2);
    const a = bank.get(alice.id)!;
    const b = bank.get(bob.id)!;
    expect([a.wins, a.losses, a.kills, a.deaths]).toEqual([1, 0, 3, 2]);
    expect([b.wins, b.losses, b.kills, b.deaths]).toEqual([0, 1, 2, 3]);
  });

  it('reconciles after a full mix of operations', () => {
    const a = bank.loginOrCreate('alice');
    const b = bank.loginOrCreate('bob');
    bank.deposit(a.id, 300);
    bank.withdraw(b.id, 150);
    bank.escrow(a.id, 80);
    bank.escrow(b.id, 80);
    bank.settle(b.id, a.id, 80, 3, 0);
    expect(bank.reconcile().ok).toBe(true);
  });
});
