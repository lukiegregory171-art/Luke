/**
 * The demo-economy lobby: sign in with a handle, see your play-money balance and
 * stats, pick a stake, deposit/withdraw demo credits, and queue for a match.
 * Everything shown here is server-authoritative PLAY-MONEY ("DEMO") — never real
 * funds. The lobby only sends intents; the server owns every balance.
 */

import {
  CURRENCY,
  DEFAULT_STAKE,
  DEPOSIT_FEE_BPS,
  WITHDRAW_FEE_BPS,
  bpsOf,
  rakeOf,
  type AccountMessage,
} from '@liquidate/shared';

const STAKES = [10, 50, 100, 250];
const BANK_AMOUNT = 500;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export class Lobby {
  private account?: AccountMessage;
  private treasury = 0;
  private stake = DEFAULT_STAKE;

  onLogin: (handle: string) => void = () => {};
  onQueue: (stake: number) => void = () => {};
  onFfa: () => void = () => {};
  onDeposit: (amount: number) => void = () => {};
  onWithdraw: (amount: number) => void = () => {};
  onPractice: () => void = () => {};

  private readonly el = {
    signin: document.getElementById('lobby-signin') as HTMLElement,
    handle: document.getElementById('lobby-handle') as HTMLInputElement,
    login: document.getElementById('lobby-login') as HTMLButtonElement,
    account: document.getElementById('lobby-account') as HTMLElement,
    who: document.getElementById('lobby-who') as HTMLElement,
    balance: document.getElementById('lobby-balance') as HTMLElement,
    stats: document.getElementById('lobby-stats') as HTMLElement,
    treasury: document.getElementById('lobby-treasury') as HTMLElement,
    stakes: document.getElementById('lobby-stakes') as HTMLElement,
    preview: document.getElementById('lobby-preview') as HTMLElement,
    deposit: document.getElementById('lobby-deposit') as HTMLButtonElement,
    withdraw: document.getElementById('lobby-withdraw') as HTMLButtonElement,
    find: document.getElementById('lobby-find') as HTMLButtonElement,
    ffa: document.getElementById('lobby-ffa') as HTMLButtonElement,
    practice: document.getElementById('lobby-practice') as HTMLButtonElement,
  };

  constructor() {
    this.el.login.addEventListener('click', () => {
      const h = this.el.handle.value.trim();
      if (h) this.onLogin(h);
    });
    this.el.handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.el.login.click();
    });
    this.el.deposit.addEventListener('click', () => this.onDeposit(BANK_AMOUNT));
    this.el.withdraw.addEventListener('click', () => this.onWithdraw(BANK_AMOUNT));
    this.el.find.addEventListener('click', () => {
      if (this.account) this.onQueue(this.stake);
    });
    this.el.ffa.addEventListener('click', () => {
      if (this.account) this.onFfa();
    });
    this.el.practice.addEventListener('click', () => this.onPractice());

    this.el.deposit.textContent = `DEPOSIT ${BANK_AMOUNT}`;
    this.el.withdraw.textContent = `WITHDRAW ${BANK_AMOUNT}`;
    this.buildStakeButtons();
    this.render();
  }

  /** Prefill the handle field (e.g. from localStorage). */
  prefillHandle(handle: string): void {
    this.el.handle.value = handle;
  }

  setAccount(a: AccountMessage): void {
    this.account = a;
    this.render();
  }

  setTreasury(balance: number): void {
    this.treasury = balance;
    this.render();
  }

  private buildStakeButtons(): void {
    this.el.stakes.innerHTML = '';
    for (const s of STAKES) {
      const b = document.createElement('button');
      b.textContent = String(s);
      b.className = 'stake' + (s === this.stake ? ' on' : '');
      b.addEventListener('click', () => {
        this.stake = s;
        this.render();
      });
      this.el.stakes.appendChild(b);
    }
  }

  private render(): void {
    const loggedIn = !!this.account;
    this.el.signin.classList.toggle('hidden', loggedIn);
    this.el.account.classList.toggle('hidden', !loggedIn);
    this.el.find.disabled = !loggedIn;
    this.el.ffa.disabled = !loggedIn;

    if (this.account) {
      this.el.who.textContent = this.account.handle;
      this.el.balance.textContent = `${fmt(this.account.balance)} ${CURRENCY}`;
      this.el.stats.textContent = `W ${this.account.wins} · L ${this.account.losses} · K ${this.account.kills} · D ${this.account.deaths}`;
    }
    this.el.treasury.textContent = `House treasury: ${fmt(this.treasury)} ${CURRENCY}`;

    for (const b of Array.from(this.el.stakes.children) as HTMLButtonElement[]) {
      b.classList.toggle('on', Number(b.textContent) === this.stake);
    }

    const balance = this.account?.balance ?? 0;
    const effective = Math.min(this.stake, balance);
    const pot = effective * 2;
    const rake = rakeOf(pot);
    this.el.preview.innerHTML =
      `Stake <b>${fmt(effective)}</b> · pot <b>${fmt(pot)}</b> · rake <b>${fmt(rake)}</b> · ` +
      `win <b class="good">+${fmt(effective - rake)}</b> / lose <b class="bad">−${fmt(effective)}</b>`;

    const depFee = bpsOf(BANK_AMOUNT, DEPOSIT_FEE_BPS);
    const wdFee = bpsOf(BANK_AMOUNT, WITHDRAW_FEE_BPS);
    this.el.deposit.title = `Mints ${BANK_AMOUNT - depFee} to you (fee ${depFee} to house)`;
    this.el.withdraw.title = `Burns ${BANK_AMOUNT} (fee ${wdFee} to house)`;
    this.el.withdraw.disabled = balance < BANK_AMOUNT;
  }
}
