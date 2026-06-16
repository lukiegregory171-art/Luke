/**
 * Pointer-lock mouse-look and keyboard/mouse state. Produces `yaw`/`pitch` and a
 * pressed-keys set that the game turns into movement input each frame.
 */

import { clamp } from '@liquidate/shared';

const PITCH_LIMIT = 1.5; // ~86 degrees up/down
const DEFAULT_SENSITIVITY = 0.0022;

export class Input {
  yaw = 0;
  pitch = 0;
  firing = false;
  locked = false;
  sensitivity = DEFAULT_SENSITIVITY;

  readonly keys = new Set<string>();

  onReload: () => void = () => {};
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
    this.keys.add(e.code);
    if (e.code === 'KeyR') this.onReload();
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}
