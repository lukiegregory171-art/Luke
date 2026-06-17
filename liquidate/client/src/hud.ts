/**
 * Thin wrapper over the HUD DOM: ammo, reload, score(s), health, latency, the
 * hitmarker, a damage flash, and a transient banner.
 */

import { MAX_HEALTH } from '@liquidate/shared';

export class Hud {
  private readonly root = document.getElementById('hud') as HTMLElement;
  private readonly ammo = document.getElementById('ammo') as HTMLElement;
  private readonly ammoCur = document.getElementById('ammo-cur') as HTMLElement;
  private readonly ammoMax = document.getElementById('ammo-max') as HTMLElement;
  private readonly reload = document.getElementById('reload') as HTMLElement;
  private readonly score = document.getElementById('score') as HTMLElement;
  private readonly hitmarker = document.getElementById('hitmarker') as HTMLElement;
  private readonly healthFill = document.getElementById('health-fill') as HTMLElement;
  private readonly healthNum = document.getElementById('health-num') as HTMLElement;
  private readonly latency = document.getElementById('latency') as HTMLElement;
  private readonly damage = document.getElementById('damage') as HTMLElement;
  private readonly bannerEl = document.getElementById('banner') as HTMLElement;
  private readonly weaponEl = document.getElementById('weapon') as HTMLElement;
  private readonly killfeed = document.getElementById('killfeed') as HTMLElement;
  private readonly dmgArrow = document.getElementById('dmgdir-arrow') as HTMLElement;

  private hitTimer?: ReturnType<typeof setTimeout>;
  private bannerTimer?: ReturnType<typeof setTimeout>;

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setAmmo(cur: number, max: number): void {
    this.ammoCur.textContent = String(cur);
    this.ammoMax.textContent = String(max);
    this.ammo.classList.toggle('low', cur <= max * 0.25);
  }

  setReloading(reloading: boolean): void {
    this.reload.classList.toggle('hidden', !reloading);
  }

  /** Practice mode: a single counter. */
  setScore(n: number): void {
    this.score.innerHTML = `DUMMIES&nbsp;DROPPED&nbsp;·&nbsp;${n}`;
  }

  /** Match mode: you vs opponent, first to the target wins. */
  setScores(self: number, opp: number): void {
    this.score.innerHTML = `<b>${self}</b>&nbsp;&nbsp;YOU&nbsp;·&nbsp;OPP&nbsp;&nbsp;<b>${opp}</b>`;
  }

  setHealth(hp: number): void {
    const frac = Math.max(0, Math.min(1, hp / MAX_HEALTH));
    this.healthFill.style.width = `${frac * 100}%`;
    this.healthNum.textContent = String(Math.max(0, Math.round(hp)));
    this.healthFill.classList.toggle('low', frac <= 0.3);
  }

  setLatency(ms: number): void {
    this.latency.textContent = `${Math.round(ms)} ms`;
  }

  hit(headshot: boolean): void {
    this.hitmarker.classList.toggle('head', headshot);
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth; // restart the animation
    this.hitmarker.classList.add('show');
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitmarker.classList.remove('show'), 120);
  }

  damageFlash(): void {
    this.damage.classList.remove('show');
    void this.damage.offsetWidth;
    this.damage.classList.add('show');
  }

  banner(text: string, kind: 'good' | 'bad'): void {
    this.bannerEl.textContent = text;
    this.bannerEl.className = `show ${kind}`;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (this.bannerEl.className = ''), 1400);
  }

  setWeapon(name: string, slot: number): void {
    this.weaponEl.innerHTML = `${name.toUpperCase()} <span class="wkey">[${slot}]</span>`;
  }

  addKill(killer: string, victim: string, headshot: boolean): void {
    const el = document.createElement('div');
    el.className = `kf${headshot ? ' head' : ''}`;
    el.innerHTML = `<b>${killer}</b> ▸ <span class="vic">${victim}</span>`;
    this.killfeed.appendChild(el);
    setTimeout(() => el.remove(), 4000);
    while (this.killfeed.childElementCount > 4) this.killfeed.firstElementChild?.remove();
  }

  /** Show a damage indicator pointing toward the attacker (radians, 0 = ahead). */
  damageFrom(angle: number): void {
    this.dmgArrow.style.transform = `rotate(${angle}rad)`;
    this.dmgArrow.classList.remove('show');
    void this.dmgArrow.offsetWidth;
    this.dmgArrow.classList.add('show');
  }
}
