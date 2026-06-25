/**
 * Procedural weapon-skin materials (Part B). Turns a data-only {@link WeaponSkin}
 * into a body + accent material (and optional particle fx), driven entirely by
 * the skin's `finish` / `emissive` / `anim` / `particle` fields — NO per-skin
 * textures to ship. The rarity ladder escalates here: matte recolour → two-tone
 * → metallic/chrome/camo → emissive accents → animated emissive + sparkle →
 * rainbow + aura.
 *
 * Client-only presentation. Materials never touch authority. `update(dt)` drives
 * the animated treatments; `decorate(group)` attaches the showpiece particle.
 */

import * as THREE from 'three';
import type { Finish, WeaponSkin } from '@liquidate/shared';

export interface SkinPaint {
  body: THREE.Material;
  accent: THREE.Material;
  accentHex: number; // accent/emissive hue (drives tracers on the viewmodel)
  decorate(group: THREE.Group): void; // attach optional particle fx
  update(dt: number): void; // animate pulse/flow/rainbow + particle
  dispose(): void;
}

const FINISH_PBR: Record<Finish, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.9, metalness: 0.0 },
  metallic: { roughness: 0.35, metalness: 0.85 },
  chrome: { roughness: 0.08, metalness: 1.0 },
  gold: { roughness: 0.22, metalness: 1.0 },
  gradient: { roughness: 0.5, metalness: 0.3 },
  two_tone: { roughness: 0.7, metalness: 0.15 },
  camo: { roughness: 0.85, metalness: 0.05 },
  animated: { roughness: 0.45, metalness: 0.4 },
};

function hexNum(h: string): number {
  return parseInt(h.replace('#', ''), 16);
}

/** A 2D canvas (or null in a non-DOM env, e.g. unit tests). */
function canvas2d(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

function gradientTex(base: string, secondary: string): THREE.CanvasTexture | undefined {
  const cv = canvas2d(8, 256);
  if (!cv) return undefined;
  const g = cv.ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, base);
  g.addColorStop(1, secondary);
  cv.ctx.fillStyle = g;
  cv.ctx.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(cv.c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function camoTex(base: string, secondary: string): THREE.CanvasTexture | undefined {
  const cv = canvas2d(128, 128);
  if (!cv) return undefined;
  const { ctx } = cv;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  const blob = (color: string, n: number, r: number) => {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.6 + Math.random()), r * (0.6 + Math.random()), Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  blob(secondary, 10, 16);
  blob('#00000022', 8, 12);
  const t = new THREE.CanvasTexture(cv.c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function radialSprite(): THREE.CanvasTexture | undefined {
  const cv = canvas2d(64, 64);
  if (!cv) return undefined;
  const g = cv.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cv.ctx.fillStyle = g;
  cv.ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv.c);
}

export function skinMaterials(skin: WeaponSkin): SkinPaint {
  const pbr = FINISH_PBR[skin.finish];
  const baseCol = new THREE.Color(hexNum(skin.base));
  const secCol = new THREE.Color(hexNum(skin.secondary));
  const emHex = hexNum(skin.emissiveColor ?? skin.secondary);

  const body = new THREE.MeshStandardMaterial({
    color: baseCol,
    flatShading: true,
    roughness: pbr.roughness,
    metalness: pbr.metalness,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: secCol,
    flatShading: true,
    roughness: Math.min(pbr.roughness, 0.5),
    metalness: Math.max(pbr.metalness, 0.3),
  });

  const textures: THREE.Texture[] = [];
  let flowTex: THREE.Texture | undefined;

  if (skin.finish === 'camo') {
    const t = camoTex(skin.base, skin.secondary);
    if (t) {
      body.map = t;
      textures.push(t);
    }
  } else if (skin.finish === 'gradient' || (skin.finish === 'animated' && skin.anim === 'flow')) {
    const t = gradientTex(skin.base, skin.secondary);
    if (t) {
      body.map = t;
      textures.push(t);
      if (skin.anim === 'flow') flowTex = t;
    }
  }

  if (skin.emissive) {
    accent.emissive = new THREE.Color(emHex);
    accent.emissiveIntensity = skin.rarity === 'Exotic' || skin.rarity === 'Legendary' ? 0.9 : 0.6;
  }

  // Optional showpiece particle (Legendary/Exotic): one cheap additive sprite.
  let sprite: THREE.Sprite | undefined;
  let spriteMat: THREE.SpriteMaterial | undefined;
  let spriteTex: THREE.Texture | undefined;

  let time = 0;

  const decorate = (group: THREE.Group): void => {
    if (!skin.particle || skin.particle === 'none') return;
    spriteTex = radialSprite();
    if (!spriteTex) return;
    const col = skin.particle === 'flame' ? 0xff7a1c : emHex;
    spriteMat = new THREE.SpriteMaterial({
      map: spriteTex,
      color: col,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    sprite = new THREE.Sprite(spriteMat);
    sprite.scale.setScalar(0.5);
    sprite.position.set(0, 0.06, -0.18);
    group.add(sprite);
  };

  const update = (dt: number): void => {
    time += dt;
    if (skin.anim === 'pulse' && skin.emissive) {
      accent.emissiveIntensity = 0.9 + Math.sin(time * 4) * 0.5;
    } else if (skin.anim === 'rainbow') {
      const h = (time * 0.15) % 1;
      body.color.setHSL(h, 0.7, 0.5);
      accent.color.setHSL((h + 0.4) % 1, 0.9, 0.6);
      if (skin.emissive) accent.emissive.setHSL((h + 0.4) % 1, 0.9, 0.55);
    } else if (skin.anim === 'flow' && flowTex) {
      flowTex.offset.y = (flowTex.offset.y - dt * 0.35 + 1) % 1;
    }
    if (sprite && spriteMat) {
      spriteMat.opacity = Math.max(0, 0.35 + Math.sin(time * 5) * 0.25);
      sprite.scale.setScalar(0.45 + Math.sin(time * 3) * 0.08);
    }
  };

  const dispose = (): void => {
    body.dispose();
    accent.dispose();
    for (const t of textures) t.dispose();
    spriteMat?.dispose();
    spriteTex?.dispose();
    if (sprite?.parent) sprite.parent.remove(sprite);
  };

  return { body, accent, accentHex: emHex, decorate, update, dispose };
}
