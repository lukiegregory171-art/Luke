// Captures raw keyboard/mouse state. Continuous keys (movement, sprint) are
// read every frame; jump/dash/reload are one-shot "consume" flags so a single
// keypress can't be read twice by two different sample points.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = { forward: false, back: false, left: false, right: false, sprint: false };
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = 0.0022;
    this.locked = false;

    this._jumpQueued = false;
    this._dashQueued = false;
    this._reloadQueued = false;
    this._switchQueued = null;

    this.firing = false;
    this.tabHeld = false;
    this.onLockChange = null;

    this._bind();
  }

  _bind() {
    this.canvas.addEventListener('click', () => {
      if (!this.locked) this.canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.back = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          if (!e.repeat) this._dashQueued = true;
          break;
        case 'Space': if (!e.repeat) this._jumpQueued = true; e.preventDefault(); break;
        case 'KeyR': if (!e.repeat) this._reloadQueued = true; break;
        case 'Digit1': this._switchQueued = 1; break;
        case 'Digit2': this._switchQueued = 2; break;
        case 'Digit3': this._switchQueued = 3; break;
        case 'Digit4': this._switchQueued = 4; break;
        case 'Tab': this.tabHeld = true; e.preventDefault(); break;
        default: break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.back = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys.sprint = false; break;
        case 'Tab': this.tabHeld = false; e.preventDefault(); break;
        default: break;
      }
    });

    window.addEventListener('blur', () => {
      this.keys.forward = this.keys.back = this.keys.left = this.keys.right = this.keys.sprint = false;
      this.firing = false;
    });
  }

  consumeJump() { const v = this._jumpQueued; this._jumpQueued = false; return v; }
  consumeDash() { const v = this._dashQueued; this._dashQueued = false; return v; }
  consumeReload() { const v = this._reloadQueued; this._reloadQueued = false; return v; }
  consumeSwitch() { const v = this._switchQueued; this._switchQueued = null; return v; }
}
