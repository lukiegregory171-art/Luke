/**
 * In-engine performance HUD: stats.js (FPS/frame-time graph) plus a panel with
 * draw calls, triangles, and texture count read from the WebGLRenderer. Toggle
 * with the backtick key. Read-only — never affects the simulation.
 */

import Stats from 'stats.js';
import type * as THREE from 'three';

export class PerfHud {
  private readonly stats = new Stats();
  private readonly panel = document.createElement('div');
  private visible = false;

  // Latest sampled metrics (also exposed for smoke tests).
  frameMs = 0;
  fps = 0;
  drawCalls = 0;
  triangles = 0;
  textures = 0;

  constructor() {
    this.stats.showPanel(0);
    Object.assign(this.stats.dom.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '60',
    });

    Object.assign(this.panel.style, {
      position: 'fixed',
      top: '56px',
      left: '8px',
      zIndex: '60',
      font: '11px ui-monospace, monospace',
      color: '#9fffe0',
      background: 'rgba(5,7,10,0.8)',
      padding: '6px 8px',
      borderRadius: '4px',
      whiteSpace: 'pre',
      pointerEvents: 'none',
    });

    document.body.appendChild(this.stats.dom);
    document.body.appendChild(this.panel);
    this.setVisible(false);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') this.setVisible(!this.visible);
    });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.stats.dom.style.display = v ? 'block' : 'none';
    this.panel.style.display = v ? 'block' : 'none';
  }

  begin(): void {
    this.stats.begin();
  }

  /** Call after rendering; reads the renderer's per-frame info. */
  end(renderer: THREE.WebGLRenderer, frameMs: number): void {
    this.stats.end();
    this.frameMs = this.frameMs === 0 ? frameMs : this.frameMs * 0.9 + frameMs * 0.1;
    this.fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;
    this.drawCalls = renderer.info.render.calls;
    this.triangles = renderer.info.render.triangles;
    this.textures = renderer.info.memory.textures;
    if (this.visible) {
      this.panel.textContent =
        `${this.fps.toFixed(0)} fps  ${this.frameMs.toFixed(1)} ms\n` +
        `draws ${this.drawCalls}\n` +
        `tris  ${this.triangles.toLocaleString()}\n` +
        `tex   ${this.textures}`;
    }
  }
}
