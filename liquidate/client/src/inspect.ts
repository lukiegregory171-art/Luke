/**
 * Weapon-skin INSPECT turntable (Part B locker). A small self-contained Three.js
 * scene that renders the actual per-archetype weapon MODEL wearing a chosen
 * cosmetic SKIN, slowly rotating under bright studio lighting on a pedestal — the
 * Rivals/CS-style inspect view. Client-only presentation; renders only while the
 * locker is open.
 */

import * as THREE from 'three';
import { COLORS } from './palette';
import { buildWeaponModel, WEAPON_GLB, type WeaponModel } from './weaponmodel';
import { skinMaterials, type SkinPaint } from './skinmat';
import { defaultSkinFor, type WeaponSkin } from '@liquidate/shared';
import type { AssetManager } from './assets';

const INSPECT_SCALE = 2.4; // blow the viewmodel-sized model up to fill the frame

export class Inspect {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly rig = new THREE.Group(); // turntable — holds the model, spins
  private model?: WeaponModel;
  private paint: SkinPaint;
  private assets?: AssetManager;
  private raf = 0;
  private running = false;
  private last = 0;

  /** Provide the asset manager so real GLB weapon models show on the turntable. */
  setAssets(assets: AssetManager): void {
    this.assets = assets;
  }

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    this.camera.position.set(0.1, 0.5, 4.2);
    this.camera.lookAt(0, -0.05, 0);

    // Bright, even studio lighting.
    this.scene.add(new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.0));
    const key = new THREE.DirectionalLight(COLORS.sun, 1.3);
    key.position.set(2, 4, 3);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-3, 1, 2);
    this.scene.add(key, fill);

    // Pedestal ring.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.04, 10, 48),
      new THREE.MeshStandardMaterial({ color: 0xc9d1d4, roughness: 0.6, metalness: 0.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.1;
    this.scene.add(ring);

    const start = defaultSkinFor('assault');
    this.paint = skinMaterials(start);
    this.buildModel(start);
    this.scene.add(this.rig);
  }

  private buildModel(skin: WeaponSkin): void {
    if (this.model) {
      if (!this.model.shared) {
        for (const m of [...this.model.body, ...this.model.accent]) m.geometry.dispose();
      }
      this.rig.remove(this.model.group);
    }
    const cfg = WEAPON_GLB[skin.weapon];
    const glb = cfg ? (this.assets?.get(cfg.asset) ?? undefined) : undefined;
    this.model = buildWeaponModel(skin.weapon, this.paint.body, this.paint.accent, glb);
    this.model.group.scale.setScalar(INSPECT_SCALE);
    this.rig.add(this.model.group);
    this.paint.decorate(this.model.group);
  }

  /** Show a weapon skin on the turntable (rebuilds the model + materials). */
  show(skin: WeaponSkin): void {
    const old = this.paint;
    this.paint = skinMaterials(skin);
    this.buildModel(skin);
    old.dispose();
  }

  /** Begin auto-rotating + rendering (call when the locker opens). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.resize();
    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.rig.rotation.y += dt * 0.7;
      this.paint.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
