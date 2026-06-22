/**
 * 3D weapon inspect (Phase B cosmetics). A small self-contained Three.js scene
 * that renders a slowly rotating weapon on a neon pedestal, tinted by the
 * currently-previewed skin accent — what a skin actually recolours in your hands
 * (viewmodel + tracers + UI + arena neon). Client-only presentation; lives in its
 * own canvas and only renders while the inventory screen is open.
 */

import * as THREE from 'three';
import { COLORS, matte, solid } from './palette';

export class Inspect {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly rig = new THREE.Group();
  private readonly accentMats: THREE.MeshStandardMaterial[] = [];
  private raf = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0.2, 0.5, 3.6);
    this.camera.lookAt(0, -0.1, 0);

    this.scene.add(new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.95));
    const sun = new THREE.DirectionalLight(COLORS.sun, 1.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);

    this.buildGun();
    this.scene.add(this.rig);
  }

  private buildGun(): void {
    const body = matte(COLORS.gunBody);
    const accent = solid(COLORS.green, 0.35);
    this.accentMats.push(accent);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 2.0), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.7), body);
    barrel.position.set(0, 0.04, -1.7);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.6), accent);
    sight.position.set(0, 0.4, -0.2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.72, 0.42), body);
    grip.position.set(0, -0.55, 0.55);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.3), accent);
    mag.position.set(0, -0.5, 0.0);

    const ringMat = solid(COLORS.green, 0.3);
    this.accentMats.push(ringMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.04, 10, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.05;

    this.rig.add(receiver, barrel, sight, grip, mag, ring);
  }

  /** Tint the weapon's accent parts to a skin colour. */
  setAccent(hex: number): void {
    for (const m of this.accentMats) {
      m.color.setHex(hex);
      m.emissive.setHex(hex);
    }
  }

  /** Begin auto-rotating + rendering (call when the inventory opens). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = (): void => {
      if (!this.running) return;
      this.rig.rotation.y += 0.012;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
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
