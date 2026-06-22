/**
 * Environment art (P5). Per-map theme (bright surface colours + an accent) plus a
 * layer of decorative "dressing" that makes the box read as a real arcade arena:
 * a stylised upper boundary band, an accent trim along the wall tops, corner
 * pylons, and flat floor markings — all open to the bright sky.
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
import { matte, solid } from './palette';

export interface EnvTheme {
  fog: number; // pale, airy distance fog
  fogNear: number;
  fogFar: number;
  floor: number; // bright floor colour
  grid: number; // subtle floor-grid line colour
  wall: number; // light wall colour
  obstacle: number; // solid accent-coloured cover blocks
}

// Bright arcade default (ARTBIBLE.md): light surfaces, bold accent cover.
export const DEFAULT_ENV: EnvTheme = {
  fog: 0xeaf6fb,
  fogNear: 40,
  fogFar: 160,
  floor: 0xe4e8ea,
  grid: 0xbcc6cb,
  wall: 0xd5dde0,
  obstacle: 0x4fc3f7, // sky blue
};

/** Each map gets a distinct bright theme (floor tint + accent cover colour). */
export const ENV_THEMES: Record<string, EnvTheme> = {
  crossfire: DEFAULT_ENV, // clean sky-blue
  refinery: { ...DEFAULT_ENV, floor: 0xeae3d2, grid: 0xcfc6ad, wall: 0xe0d8c6, obstacle: 0xff8a5c }, // warm sand + coral
  vault: { ...DEFAULT_ENV, floor: 0xece6d6, grid: 0xd2c9a8, wall: 0xe6dcc2, obstacle: 0xe8b84b }, // gold vault
  datacenter: { ...DEFAULT_ENV, floor: 0xe6ecf0, grid: 0xb8c6cf, wall: 0xd2dde4, obstacle: 0x4fc3f7 }, // cool blue
  tradingfloor: { ...DEFAULT_ENV, floor: 0xe6ece6, grid: 0xbecbbe, wall: 0xd6e0d6, obstacle: 0x7cc96b }, // green floor
};

export function envTheme(map: GameMap): EnvTheme {
  return ENV_THEMES[map.id] ?? DEFAULT_ENV;
}

const ACCENT = 0x2bd96b; // brand green; World.setAccent retints these

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

  const perimeter: [number, number, number, number][] = [
    [0, -halfD, map.width, t],
    [0, halfD, map.width, t],
    [-halfW, 0, t, map.depth],
    [halfW, 0, t, map.depth],
  ];

  // Stylised upper boundary band — a brighter extension of the (short)
  // collidable walls, open to the sky. Players are ground-based and ~1.8 tall,
  // so this is never reachable and never cover.
  const bandMat = matte(new THREE.Color(theme.wall).offsetHSL(0, 0, 0.04).getHex());
  for (const [cx, cz, sx, sz] of perimeter) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, upperH, sz), bandMat);
    m.position.set(cx, wallH + upperH / 2, cz);
    group.add(m);
  }

  // Solid accent trim at the wall top (retintable by the skin).
  const trimMat = solid(ACCENT, 0.3);
  accentMats.push(trimMat);
  const trimH = 0.16;
  for (const [cx, cz, sx, sz] of perimeter) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, trimH, sz + 0.04), trimMat);
    m.position.set(cx, wallH + trimH / 2, cz);
    group.add(m);
  }

  // Corner pylons: chunky accent verticals flush in the corners (architectural,
  // at the perimeter — never mistakable as interior cover).
  const pylonMat = solid(ACCENT, 0.28);
  accentMats.push(pylonMat);
  const px = 0.3;
  const pylonH = wallH + upperH;
  const corners: [number, number][] = [
    [-halfW + px / 2, -halfD + px / 2],
    [halfW - px / 2, -halfD + px / 2],
    [-halfW + px / 2, halfD - px / 2],
    [halfW - px / 2, halfD - px / 2],
  ];
  for (const [cx, cz] of corners) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(px, pylonH, px), pylonMat);
    p.position.set(cx, pylonH / 2, cz);
    group.add(p);
  }

  // Floor markings: a centre ring + spawn pads. Flat decals just above the
  // floor — clearly not cover.
  const ringMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 });
  accentMats.push(ringMat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  const padMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22 });
  accentMats.push(padMat);
  for (const s of map.spawns) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.pos.x, 0.025, s.pos.z);
    group.add(pad);
  }

  return { group, accentMats };
}
