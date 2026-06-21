/**
 * Environment art (P5). Per-map mood (fog + base material colours) plus a layer
 * of decorative "dressing" that makes the box read as a real arena: an upper
 * wall band, an emissive accent trim, a ceiling with light strips, corner
 * pylons, and floor markings.
 *
 * Client-only presentation, and it deliberately preserves "what you see is what
 * you collide with": NONE of this dressing is a collider (collision is only
 * `map.obstacles`, server-side). To avoid faking cover, every tall decorative
 * element lives at the perimeter or above the wall line — never planted in the
 * interior at player height — and interior decor is flat floor markings. The
 * theme is keyed by map id (data-driven); the accent pieces are returned so the
 * skin system can retint them.
 */

import * as THREE from 'three';
import type { GameMap } from '@liquidate/shared';

export interface EnvTheme {
  fog: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  wall: number;
  obstacle: number;
}

// Locked palette (ARTBIBLE.md): dark desaturated env so neon/players POP.
export const DEFAULT_ENV: EnvTheme = {
  fog: 0x070b0c,
  fogNear: 18,
  fogFar: 60,
  floor: 0x0b1112,
  wall: 0x0e1719,
  obstacle: 0x14201e,
};

/** Per-map identity is a subtle fog tint; floor/wall/crate stay locked. */
export const ENV_THEMES: Record<string, EnvTheme> = {
  crossfire: DEFAULT_ENV,
  refinery: { ...DEFAULT_ENV, fog: 0x0a0c0a }, // faint warm
  vault: { ...DEFAULT_ENV, fog: 0x0a0710 }, // faint violet
  datacenter: { ...DEFAULT_ENV, fog: 0x070d10 }, // faint cyan
  tradingfloor: { ...DEFAULT_ENV, fog: 0x0c0a07 }, // faint gold
};

export function envTheme(map: GameMap): EnvTheme {
  return ENV_THEMES[map.id] ?? DEFAULT_ENV;
}

const ACCENT = 0x16f08a; // locked brand green; World.setAccent retints these

/**
 * Build the decorative dressing for a map. Returns the group to add to the
 * scene and the accent-tinted materials to register for skin retinting.
 */
export function buildDressing(
  map: GameMap,
  theme: EnvTheme,
): { group: THREE.Group; accentMats: THREE.Material[] } {
  const group = new THREE.Group();
  const accentMats: THREE.Material[] = [];
  const halfW = map.width / 2;
  const halfD = map.depth / 2;
  const wallH = map.wallHeight;
  const t = 0.4;
  const upperH = 3.2;
  const topY = wallH + upperH;

  const perimeter: [number, number, number, number][] = [
    [0, -halfD, map.width, t],
    [0, halfD, map.width, t],
    [-halfW, 0, t, map.depth],
    [halfW, 0, t, map.depth],
  ];

  // Darker upper wall band — encloses the space above the (short) collidable
  // walls. Players are ground-based and ~1.8 tall, so this is never reachable.
  const bandMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.wall).multiplyScalar(0.55),
    metalness: 0.15,
    roughness: 0.85,
  });
  for (const [cx, cz, sx, sz] of perimeter) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, upperH, sz), bandMat);
    m.position.set(cx, wallH + upperH / 2, cz);
    group.add(m);
  }

  // Emissive accent trim at the wall top (blooms; retintable by the skin).
  const trimMat = new THREE.MeshStandardMaterial({
    color: ACCENT,
    emissive: ACCENT,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  accentMats.push(trimMat);
  const trimH = 0.12;
  for (const [cx, cz, sx, sz] of perimeter) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, trimH, sz + 0.02), trimMat);
    m.position.set(cx, wallH + trimH / 2, cz);
    group.add(m);
  }

  // Ceiling slab + warm light strips (fixed warm fixtures, not skin-tinted).
  const ceilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.wall).multiplyScalar(0.4),
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), ceilMat);
  ceiling.rotation.x = Math.PI / 2; // face down
  ceiling.position.y = topY;
  group.add(ceiling);

  const stripMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
  const strips = 3;
  for (let i = 0; i < strips; i++) {
    const z = -halfD * 0.55 + (i / (strips - 1)) * halfD * 1.1;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(map.width * 0.5, 0.4), stripMat);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, topY - 0.02, z);
    group.add(strip);
  }

  // Corner pylons: thin emissive verticals flush in the corners (architectural,
  // at the perimeter — never mistakable as interior cover).
  const pylonMat = new THREE.MeshStandardMaterial({
    color: ACCENT,
    emissive: ACCENT,
    emissiveIntensity: 1.0,
    roughness: 0.5,
  });
  accentMats.push(pylonMat);
  const px = 0.18;
  const corners: [number, number][] = [
    [-halfW + px, -halfD + px],
    [halfW - px, -halfD + px],
    [-halfW + px, halfD - px],
    [halfW - px, halfD - px],
  ];
  for (const [cx, cz] of corners) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(px, topY, px), pylonMat);
    p.position.set(cx, topY / 2, cz);
    group.add(p);
  }

  // Floor markings: a centre ring + spawn pads. Flat decals just above the
  // floor — clearly not cover.
  const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5 });
  accentMats.push(ringMat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  const padMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18 });
  accentMats.push(padMat);
  for (const s of map.spawns) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.pos.x, 0.025, s.pos.z);
    group.add(pad);
  }

  return { group, accentMats };
}
