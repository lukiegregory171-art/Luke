/**
 * Tiny synthesized sound effects via the Web Audio API — no asset files. The
 * context is created lazily and resumed on the first user gesture (browsers
 * require it). Everything routes through a master gain so volume/mute (P6) work.
 *
 * P6 adds: master volume + mute, UI click feedback, movement footsteps, and a
 * low ambient arena hum.
 */

import { MOVE_SPEED, type WeaponId } from '@liquidate/shared';

/** Per-weapon shot sound (noise burst + optional low sub for heavy guns). */
const SHOT: Record<WeaponId, { dur: number; gain: number; freq: number; sub?: number }> = {
  assault: { dur: 0.07, gain: 0.22, freq: 1300 },
  smg: { dur: 0.05, gain: 0.16, freq: 1700 },
  sniper: { dur: 0.22, gain: 0.4, freq: 600, sub: 180 },
  shotgun: { dur: 0.18, gain: 0.4, freq: 620, sub: 110 },
  pistol: { dur: 0.06, gain: 0.2, freq: 1500 },
  lmg: { dur: 0.07, gain: 0.24, freq: 1100 },
  marksman: { dur: 0.1, gain: 0.3, freq: 900, sub: 220 },
};

export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private ambient?: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode };
  private thrustNode?: { src: AudioBufferSourceNode; gain: GainNode };
  private stepAcc = 0;
  private volume = 0.7;
  private muted = false;
  enabled = true;

  /** Call from a user gesture so the AudioContext is allowed to start. */
  resume(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyGain();
      this.noise = this.makeNoise(this.ctx);
    }
    void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private get out(): AudioNode | undefined {
    return this.master ?? this.ctx?.destination;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.2, slideTo?: number): void {
    const out = this.out;
    if (!this.enabled || !this.ctx || !out) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur);
  }

  private burst(dur: number, gain: number, freq: number): void {
    const out = this.out;
    if (!this.enabled || !this.ctx || !this.noise || !out) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur);
  }

  shoot(weapon: WeaponId): void {
    const s = SHOT[weapon];
    this.burst(s.dur, s.gain, s.freq);
    if (s.sub) this.tone(s.sub, s.dur * 0.8, 'sawtooth', 0.12, s.sub * 0.4);
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

  /** Short hop blip. */
  jump(): void {
    this.tone(440, 0.08, 'square', 0.1, 700);
  }

  /** Escalating multi-kill / streak callout (louder + higher with level). */
  multiKill(level: number): void {
    const base = 440 + level * 70;
    this.tone(base, 0.12, 'triangle', 0.26);
    setTimeout(() => this.tone(base * 1.5, 0.18, 'triangle', 0.26), 90);
    if (level >= 3) setTimeout(() => this.tone(base * 2, 0.2, 'triangle', 0.24), 190);
  }

  /** Jetpack thrust loop — on while thrusting, off otherwise. */
  thrustOn(on: boolean): void {
    const out = this.out;
    if (on) {
      if (this.thrustNode || !this.ctx || !this.noise || !out) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 340;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, this.ctx.currentTime + 0.08);
      src.connect(filter).connect(gain).connect(out);
      src.start();
      this.thrustNode = { src, gain };
    } else {
      if (!this.thrustNode || !this.ctx) return;
      const { src, gain } = this.thrustNode;
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      src.stop(t + 0.12);
      this.thrustNode = undefined;
    }
  }

  /** Short UI click (button presses). */
  ui(): void {
    this.tone(660, 0.025, 'square', 0.08);
  }

  /** Soft footstep thud, timed by movement speed. Call every frame. */
  footsteps(dt: number, speed: number): void {
    if (speed < 1.2) {
      this.stepAcc = 0;
      return;
    }
    const interval = 0.34 - Math.min(speed / MOVE_SPEED, 1) * 0.1; // faster = quicker steps
    this.stepAcc += dt;
    if (this.stepAcc >= interval) {
      this.stepAcc = 0;
      this.burst(0.05, 0.05, 180);
    }
  }

  /** Start a low arena hum (during a match). Idempotent. */
  startAmbient(): void {
    const out = this.out;
    if (!this.ctx || !out || this.ambient) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 58;
    sub.type = 'sine';
    sub.frequency.value = 87; // a soft fifth above for body
    gain.gain.value = 0.05;
    osc.connect(gain);
    sub.connect(gain);
    gain.connect(out);
    osc.start();
    sub.start();
    this.ambient = { osc, sub, gain };
  }

  /** Stop the arena hum. */
  stopAmbient(): void {
    if (!this.ambient || !this.ctx) return;
    const { osc, sub, gain } = this.ambient;
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.stop(t + 0.32);
    sub.stop(t + 0.32);
    this.ambient = undefined;
  }
}
