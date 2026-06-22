/**
 * Procedural canvas maps (ARTBIBLE.md — bright arcade). These are flat ALBEDO
 * maps, not emissive glow: a clean light floor grid and a crisp crypto "ticker"
 * candlestick sign. Detail comes from shape + bold solid colour, not photo
 * textures and not bloom. Client-only; drawn once at startup.
 */

import * as THREE from 'three';

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** A clean grid cell — subtle darker lines on a light tile (tiles via repeat). */
export function makeGridTexture(line: number, bg: number): THREE.CanvasTexture {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hex(bg);
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = hex(line);
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, s, s);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s / 2, 0);
  ctx.lineTo(s / 2, s);
  ctx.moveTo(0, s / 2);
  ctx.lineTo(s, s / 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A crisp candlestick "ticker" sign on a light panel — the crypto signage. */
export function makeTickerTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Light panel with a soft inset border.
  ctx.fillStyle = '#f2f4f5';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c9d1d4';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  const candles = 32;
  const cw = w / candles;
  let price = h * 0.5;
  for (let i = 0; i < candles; i++) {
    const open = price;
    price += (Math.random() - 0.48) * 22;
    price = Math.max(20, Math.min(h - 20, price));
    const close = price;
    const up = close <= open; // canvas y is inverted: smaller y = higher price
    const col = up ? '#2bd96b' : '#ff4d4d'; // bright solid team colours
    const x = i * cw + cw / 2;
    const top = Math.min(open, close);
    const bot = Math.max(open, close);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    // wick
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top - 8);
    ctx.lineTo(x, bot + 8);
    ctx.stroke();
    // body
    ctx.fillRect(x - cw * 0.3, top, cw * 0.6, Math.max(3, bot - top));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
