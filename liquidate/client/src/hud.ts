/**
 * Thin wrapper over the HUD DOM: ammo, reload state, score, and the hitmarker.
 */

export class Hud {
  private readonly root = document.getElementById('hud') as HTMLElement;
  private readonly ammo = document.getElementById('ammo') as HTMLElement;
  private readonly ammoCur = document.getElementById('ammo-cur') as HTMLElement;
  private readonly ammoMax = document.getElementById('ammo-max') as HTMLElement;
  private readonly reload = document.getElementById('reload') as HTMLElement;
  private readonly score = document.getElementById('score') as HTMLElement;
  private readonly hitmarker = document.getElementById('hitmarker') as HTMLElement;

  private hitTimer?: ReturnType<typeof setTimeout>;

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

  setScore(n: number): void {
    this.score.innerHTML = `DUMMIES&nbsp;DROPPED&nbsp;·&nbsp;${n}`;
  }

  hit(headshot: boolean): void {
    this.hitmarker.classList.toggle('head', headshot);
    // Restart the pop animation.
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth; // force reflow
    this.hitmarker.classList.add('show');
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitmarker.classList.remove('show'), 120);
  }
}
