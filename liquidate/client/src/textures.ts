/**
 * Procedural emissive canvas maps (ARTBIBLE.md): a glowing floor grid and a
 * crypto "ticker" candlestick panel. Detail comes from shape + neon, not photo
 * textures. Client-only; drawn once at startup. These feed `emissiveMap` slots,
 * so they bloom.
 */

import * as THREE from 'three';

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** A glowing grid cell (tiles across the floor via RepeatWrapping). */
export function makeGridTexture(color: number): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = hex(color);
  ctx.shadowColor = hex(color);
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, s, s);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s / 2, 0);
  ctx.lineTo(s / 2, s);
  ctx.moveTo(0, s / 2);
  ctx.lineTo(s, s / 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** A neon candlestick "ticker" chart panel — the crypto-arena signage. */
export function makeTickerTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  const candles = 32;
  const cw = w / candles;
  let price = h * 0.5;
  for (let i = 0; i < candles; i++) {
    const open = price;
    price += (Math.random() - 0.48) * 22;
    price = Math.max(16, Math.min(h - 16, price));
    const close = price;
    const up = close <= open; // canvas y is inverted: smaller y = higher price
    const col = up ? '#16F08A' : '#FF3B47';
    const x = i * cw + cw / 2;
    const top = Math.min(open, close);
    const bot = Math.max(open, close);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    // wick
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, top - 8);
    ctx.lineTo(x, bot + 8);
    ctx.stroke();
    // body
    ctx.fillRect(x - cw * 0.3, top, cw * 0.6, Math.max(2, bot - top));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
