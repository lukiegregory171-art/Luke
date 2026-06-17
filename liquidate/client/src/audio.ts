/**
 * Tiny synthesized sound effects via the Web Audio API — no asset files. The
 * context is created lazily and resumed on the first user gesture (the menu
 * click), as browsers require.
 */

import type { WeaponId } from '@liquidate/shared';

export class Sfx {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;
  enabled = true;

  /** Call from a user gesture so the AudioContext is allowed to start. */
  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.noise = this.makeNoise(this.ctx);
    }
    void this.ctx.resume();
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.2,
    slideTo?: number,
  ): void {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  private burst(dur: number, gain: number, freq: number): void {
    if (!this.enabled || !this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + dur);
  }

  shoot(weapon: WeaponId): void {
    if (weapon === 'shotgun') this.burst(0.18, 0.35, 700);
    else this.burst(0.07, 0.22, 1400);
  }

  hit(headshot: boolean): void {
    this.tone(headshot ? 1320 : 880, 0.07, 'square', 0.18);
  }

  reload(): void {
    this.tone(420, 0.05, 'square', 0.15);
    setTimeout(() => this.tone(300, 0.06, 'square', 0.15), 120);
  }

  dash(): void {
    this.burst(0.16, 0.18, 500);
  }

  kill(): void {
    this.tone(523, 0.1, 'triangle', 0.22);
    setTimeout(() => this.tone(784, 0.14, 'triangle', 0.22), 90);
  }

  death(): void {
    this.tone(200, 0.4, 'sawtooth', 0.22, 70);
  }
}
