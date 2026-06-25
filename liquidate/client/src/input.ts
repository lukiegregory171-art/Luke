/**
 * Pointer-lock mouse-look and keyboard/mouse state. Produces `yaw`/`pitch` and a
 * pressed-keys set that the game turns into movement input each frame.
 */

import { clamp, WEAPON_IDS, type WeaponId } from '@liquidate/shared';

const PITCH_LIMIT = 1.5; // ~86 degrees up/down
const DEFAULT_SENSITIVITY = 0.0022;

export class Input {
  yaw = 0;
  pitch = 0;
  firing = false;
  locked = false;
  scoreboard = false; // Tab held — show the live scoreboard
  sensitivity = DEFAULT_SENSITIVITY;

  readonly keys = new Set<string>();
  private dashQueued = false;
  private jumpQueued = false;

  onReload: () => void = () => {};
  onSwitch: (weapon: WeaponId) => void = () => {};
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly target: HTMLElement) {
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
  }

  requestLock(): void {
    this.target.requestPointerLock();
  }

  private handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.target;
    if (!this.locked) {
      this.firing = false;
      this.scoreboard = false;
      this.keys.clear();
    }
    this.onLockChange(this.locked);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.locked || e.button !== 0) return;
    this.firing = true;
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.firing = false;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.locked) return;
    if (e.code === 'Tab') {
      this.scoreboard = true;
      e.preventDefault(); // don't shift focus
    }
    const fresh = !this.keys.has(e.code);
    this.keys.add(e.code);
    if (!fresh) return; // ignore auto-repeat for edge-triggered actions
    if (e.code === 'KeyR') this.onReload();
    else if (e.code === 'Space') this.jumpQueued = true;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.dashQueued = true;
    else if (e.code.startsWith('Digit')) {
      const id = WEAPON_IDS[Number(e.code.slice(5)) - 1];
      if (id) this.onSwitch(id);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') this.scoreboard = false;
    this.keys.delete(e.code);
  };

  /** Returns true once after a dash key press (edge-triggered). */
  consumeDash(): boolean {
    const d = this.dashQueued;
    this.dashQueued = false;
    return d;
  }

  /** Returns true once after a jump key press (edge-triggered). */
  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }
}
