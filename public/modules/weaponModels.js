import * as THREE from '/vendor/three.module.js';

// Low-poly gun shapes built from primitives, one shared geometry set reused for
// both the first-person view-model and the third-person model held by remote
// players. Each model is built along local +Z (barrel points toward +Z) with
// the grip near the origin, so it can be attached and aimed consistently.

const METAL = 0x2b2b30;
const METAL_LIGHT = 0x484850;

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

function buildAR() {
  const group = new THREE.Group();
  const body = box(0.09, 0.13, 0.5, METAL);
  body.position.set(0, 0, 0.1);
  const barrel = box(0.035, 0.035, 0.32, METAL_LIGHT);
  barrel.position.set(0, 0.01, 0.5);
  const mag = box(0.07, 0.22, 0.09, METAL);
  mag.position.set(0, -0.16, 0.12);
  mag.rotation.x = 0.15;
  const stock = box(0.06, 0.09, 0.22, METAL);
  stock.position.set(0, -0.01, -0.25);
  const sight = box(0.03, 0.06, 0.06, METAL_LIGHT);
  sight.position.set(0, 0.1, 0.05);
  group.add(body, barrel, mag, stock, sight);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, 0.66);
  group.add(muzzle);
  return { group, muzzle };
}

function buildShotgun() {
  const group = new THREE.Group();
  const body = box(0.11, 0.14, 0.36, METAL);
  body.position.set(0, 0, 0.05);
  const barrelL = box(0.045, 0.045, 0.4, METAL_LIGHT);
  barrelL.position.set(-0.035, 0.02, 0.42);
  const barrelR = barrelL.clone();
  barrelR.position.x = 0.035;
  const pump = box(0.08, 0.06, 0.16, METAL);
  pump.position.set(0, -0.06, 0.36);
  const stock = box(0.07, 0.1, 0.24, 0x5a3d24);
  stock.position.set(0, -0.01, -0.24);
  group.add(body, barrelL, barrelR, pump, stock);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.62);
  group.add(muzzle);
  return { group, muzzle };
}

function buildSniper() {
  const group = new THREE.Group();
  const body = box(0.08, 0.1, 0.7, METAL);
  body.position.set(0, 0, 0.1);
  const barrel = box(0.03, 0.03, 0.35, METAL_LIGHT);
  barrel.position.set(0, 0, 0.62);
  const scope = box(0.06, 0.06, 0.28, 0x14161a);
  scope.position.set(0, 0.09, 0.12);
  const stock = box(0.06, 0.08, 0.3, 0x5a3d24);
  stock.position.set(0, -0.01, -0.36);
  const bipod = box(0.02, 0.14, 0.02, METAL_LIGHT);
  bipod.position.set(0, -0.12, 0.5);
  group.add(body, barrel, scope, stock, bipod);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.8);
  group.add(muzzle);
  return { group, muzzle };
}

function buildRocket() {
  const group = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.75, 10),
    new THREE.MeshLambertMaterial({ color: 0x3a4a2f }),
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.set(0, 0, 0.15);
  const rearCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.06, 0.16, 10),
    new THREE.MeshLambertMaterial({ color: 0x2b2b30 }),
  );
  rearCone.rotation.x = -Math.PI / 2;
  rearCone.position.set(0, 0, -0.28);
  const grip = box(0.07, 0.2, 0.08, METAL);
  grip.position.set(0, -0.15, -0.05);
  const sight = box(0.03, 0.05, 0.05, METAL_LIGHT);
  sight.position.set(0, 0.12, 0.1);
  group.add(tube, rearCone, grip, sight);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 0.53);
  group.add(muzzle);
  return { group, muzzle };
}

const BUILDERS = { ar: buildAR, shotgun: buildShotgun, sniper: buildSniper, rocket: buildRocket };

export function createWeaponModel(weaponId) {
  const builder = BUILDERS[weaponId] || buildAR;
  return builder();
}
