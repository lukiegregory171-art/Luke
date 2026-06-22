/**
 * Data-driven low-poly weapon MODELS (Part A). Each archetype gets its own
 * multi-part procedural model with a clearly distinct silhouette — receiver,
 * barrel, magazine, grip, stock, sight/rail, muzzle, scope where relevant — and
 * its own first-person hold pose. Built from simple boxes/cylinders so it stays
 * cheap and on-style with the bright Krunker/Rivals look.
 *
 * Parts are tagged `body` vs `accent` so the cosmetic SKIN system (Part B) can
 * material them procedurally (base colour on the body, secondary/emissive on the
 * accent) without per-skin geometry. NONE of this touches authority — the model
 * is purely what you see; hits are server-side spheres.
 */

import * as THREE from 'three';
import type { WeaponId } from '@liquidate/shared';

export interface WeaponModel {
  group: THREE.Group;
  body: THREE.Mesh[]; // main chassis — takes the skin's base colour
  accent: THREE.Mesh[]; // sights/rails/mag/scope — takes the secondary/emissive
  muzzle: { x: number; y: number; z: number }; // barrel tip (tracer origin), local
}

/** Per-weapon first-person rest pose (the bob/sway/recoil ride on top). */
export const VIEWMODEL_POSE: Record<
  WeaponId,
  { pos: [number, number, number]; rot: [number, number, number]; scale: number }
> = {
  pistol: { pos: [0.18, -0.17, -0.4], rot: [0, 0, 0], scale: 1 },
  smg: { pos: [0.2, -0.2, -0.42], rot: [0, 0, 0], scale: 1 },
  assault: { pos: [0.22, -0.2, -0.5], rot: [0, 0, 0], scale: 1 },
  sniper: { pos: [0.16, -0.16, -0.62], rot: [0.02, 0, 0], scale: 1 },
  shotgun: { pos: [0.22, -0.2, -0.48], rot: [0, 0, 0], scale: 1 },
  lmg: { pos: [0.24, -0.22, -0.52], rot: [0, 0, 0], scale: 1 },
  marksman: { pos: [0.18, -0.17, -0.56], rot: [0.02, 0, 0], scale: 1 },
};

type Part = 'body' | 'accent';

function box(
  out: WeaponModel,
  part: Part,
  mat: THREE.Material,
  size: [number, number, number],
  pos: [number, number, number],
): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  out.group.add(m);
  out[part].push(m);
}

function tube(
  out: WeaponModel,
  part: Part,
  mat: THREE.Material,
  radius: number,
  len: number,
  pos: [number, number, number],
): void {
  // A cylinder laid along Z (barrels, scopes).
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  out.group.add(m);
  out[part].push(m);
}

/**
 * Build a weapon's model. `bodyMat`/`accentMat` are supplied by the caller (the
 * viewmodel or the inspect view) so the same geometry can be re-skinned just by
 * swapping materials. Forward is -Z (matches the camera).
 */
export function buildWeaponModel(
  id: WeaponId,
  bodyMat: THREE.Material,
  accentMat: THREE.Material,
): WeaponModel {
  const out: WeaponModel = {
    group: new THREE.Group(),
    body: [],
    accent: [],
    muzzle: { x: 0, y: 0.01, z: -0.5 },
  };
  const b = (s: [number, number, number], p: [number, number, number]) =>
    box(out, 'body', bodyMat, s, p);
  const a = (s: [number, number, number], p: [number, number, number]) =>
    box(out, 'accent', accentMat, s, p);

  switch (id) {
    case 'pistol': {
      b([0.085, 0.13, 0.26], [0, 0.02, -0.04]); // slide/receiver
      b([0.05, 0.05, 0.12], [0, 0.03, -0.22]); // short barrel
      b([0.08, 0.17, 0.1], [0, -0.13, 0.05]); // grip (angled-ish)
      a([0.03, 0.04, 0.18], [0, 0.1, -0.02]); // top sight rail
      out.muzzle = { x: 0, y: 0.03, z: -0.3 };
      break;
    }
    case 'smg': {
      b([0.1, 0.14, 0.32], [0, 0.01, -0.05]); // stubby body
      b([0.05, 0.05, 0.1], [0, 0.02, -0.24]); // short barrel
      b([0.07, 0.16, 0.09], [0, -0.14, 0.07]); // grip
      a([0.075, 0.28, 0.1], [0, -0.2, -0.06]); // extended magazine (signature)
      a([0.03, 0.045, 0.22], [0, 0.1, -0.02]); // top rail
      out.muzzle = { x: 0, y: 0.02, z: -0.34 };
      break;
    }
    case 'assault': {
      b([0.09, 0.13, 0.5], [0, 0, -0.06]); // long receiver
      b([0.045, 0.045, 0.4], [0, 0.02, -0.42]); // mid barrel
      b([0.07, 0.1, 0.2], [0, -0.01, 0.22]); // stock
      b([0.07, 0.16, 0.1], [0, -0.13, 0.04]); // grip
      a([0.07, 0.2, 0.12], [0, -0.16, -0.04]); // magazine
      a([0.035, 0.05, 0.34], [0, 0.1, -0.04]); // rail + sight
      out.muzzle = { x: 0, y: 0.02, z: -0.74 };
      break;
    }
    case 'sniper': {
      b([0.08, 0.12, 0.6], [0, 0, -0.05]); // long thin body
      b([0.04, 0.04, 0.72], [0, 0.02, -0.5]); // very long barrel
      b([0.07, 0.11, 0.22], [0, -0.01, 0.26]); // stock
      b([0.07, 0.16, 0.1], [0, -0.13, 0.06]); // grip
      a([0.07, 0.16, 0.1], [0, -0.15, -0.02]); // magazine
      tube(out, 'accent', accentMat, 0.06, 0.34, [0, 0.13, -0.08]); // big scope
      a([0.03, 0.08, 0.04], [0, 0.07, -0.22]); // front scope mount
      a([0.03, 0.08, 0.04], [0, 0.07, 0.04]); // rear scope mount
      out.muzzle = { x: 0, y: 0.02, z: -0.98 };
      break;
    }
    case 'shotgun': {
      b([0.13, 0.13, 0.44], [0, 0, -0.04]); // wide chunky body
      b([0.11, 0.07, 0.4], [0, 0.04, -0.32]); // wide barrel
      b([0.08, 0.11, 0.2], [0, -0.02, 0.24]); // stock
      b([0.08, 0.16, 0.1], [0, -0.13, 0.05]); // grip
      a([0.1, 0.06, 0.18], [0, -0.06, -0.26]); // pump (signature)
      out.muzzle = { x: 0, y: 0.04, z: -0.56 };
      break;
    }
    case 'lmg': {
      b([0.12, 0.16, 0.56], [0, 0, -0.05]); // bulky receiver
      b([0.05, 0.05, 0.46], [0, 0.03, -0.46]); // heavy barrel
      b([0.08, 0.11, 0.22], [0, -0.01, 0.27]); // stock
      b([0.08, 0.16, 0.1], [0, -0.14, 0.05]); // grip
      a([0.18, 0.2, 0.2], [0, -0.16, 0.02]); // big ammo box (signature)
      a([0.04, 0.05, 0.34], [0, 0.12, -0.05]); // rail
      out.muzzle = { x: 0, y: 0.03, z: -0.82 };
      break;
    }
    case 'marksman': {
      b([0.085, 0.12, 0.54], [0, 0, -0.05]); // medium-long body
      b([0.04, 0.04, 0.46], [0, 0.02, -0.46]); // barrel
      b([0.07, 0.1, 0.22], [0, -0.01, 0.25]); // stock
      b([0.07, 0.16, 0.1], [0, -0.13, 0.05]); // grip
      a([0.07, 0.18, 0.11], [0, -0.15, -0.02]); // magazine
      tube(out, 'accent', accentMat, 0.05, 0.26, [0, 0.12, -0.06]); // mid scope
      out.muzzle = { x: 0, y: 0.02, z: -0.82 };
      break;
    }
  }
  return out;
}
