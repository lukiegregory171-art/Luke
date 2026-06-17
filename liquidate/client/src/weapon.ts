/**
 * First-person weapon viewmodel plus shot feedback: muzzle flash, a fading
 * tracer beam, and a little recoil kick. Purely cosmetic — the authoritative
 * hit math lives in @liquidate/shared.
 */

import * as THREE from 'three';
import type { Vec3 } from '@liquidate/shared';

interface Tracer {
  mesh: THREE.Mesh;
  age: number;
  life: number;
}

const TRACER_LIFE = 0.07;

export class Weapon {
  private readonly group = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;
  private readonly tracers: Tracer[] = [];

  // Recoil state (smoothly returns to zero).
  private recoil = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    // Build a simple rifle out of a few boxes, parented to the camera.
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a2028,
      roughness: 0.5,
      metalness: 0.6,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x16e0a3,
      emissive: 0x0c5a42,
      roughness: 0.4,
    });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.45), bodyMat);
    barrel.position.set(0, 0.01, -0.42);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.12), accentMat);
    sight.position.set(0, 0.09, -0.05);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), bodyMat);
    grip.position.set(0, -0.13, 0.12);

    this.group.add(receiver, barrel, sight, grip);
    this.group.position.set(0.22, -0.2, -0.45);
    this.camera.add(this.group);

    // Muzzle point at the end of the barrel (world position used for tracers).
    this.muzzle.position.set(0, 0.01, -0.66);
    this.group.add(this.muzzle);

    // Muzzle flash quad (hidden until a shot).
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flash.position.copy(this.muzzle.position);
    this.group.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffd27f, 0, 8);
    this.flashLight.position.copy(this.muzzle.position);
    this.group.add(this.flashLight);

    // Camera must be in the scene graph for its children to render.
    this.scene.add(this.camera);
  }

  /** World-space position of the muzzle, for spawning a tracer. */
  muzzleWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }

  fire(hitPoint: Vec3): void {
    // Muzzle flash on.
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.flashLight.intensity = 6;

    this.recoil = Math.min(this.recoil + 0.05, 0.12);
    this.spawnTracer(this.muzzleWorldPosition(), hitPoint);
  }

  /** Render a tracer for another player's shot (world-space origin and endpoint). */
  spawnWorldTracer(from: Vec3, to: Vec3): void {
    this.spawnTracer(new THREE.Vector3(from.x, from.y, from.z), to);
  }

  private spawnTracer(from: THREE.Vector3, to: Vec3): void {
    const target = new THREE.Vector3(to.x, to.y, to.z);
    const dir = new THREE.Vector3().subVectors(target, from);
    const len = dir.length();
    if (len < 1e-3) return;

    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbafff0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // A cylinder is built along +Y; orient it along the shot direction.
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.scene.add(mesh);
    this.tracers.push({ mesh, age: 0, life: TRACER_LIFE });
  }

  update(dt: number): void {
    // Decay muzzle flash.
    const flashMat = this.flash.material as THREE.MeshBasicMaterial;
    if (flashMat.opacity > 0) flashMat.opacity = Math.max(0, flashMat.opacity - dt / 0.04);
    if (this.flashLight.intensity > 0)
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - (dt / 0.04) * 6);

    // Recoil recovery; apply as a small Z push + pitch on the viewmodel.
    this.recoil = Math.max(0, this.recoil - dt * 0.8);
    this.group.position.z = -0.45 + this.recoil;
    this.group.rotation.x = this.recoil * 1.2;

    // Fade + retire tracers.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.age += dt;
      const k = 1 - tr.age / tr.life;
      if (k <= 0) {
        this.scene.remove(tr.mesh);
        tr.mesh.geometry.dispose();
        (tr.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      } else {
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
      }
    }
  }
}
