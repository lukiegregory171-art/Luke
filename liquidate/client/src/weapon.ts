/**
 * First-person weapon viewmodel plus shot feedback: muzzle flash, fading
 * tracer beams, recoil kick, and movement bob + look sway. Purely cosmetic —
 * the authoritative hit math lives in @liquidate/shared.
 *
 * P1: tracers are pooled. A fixed set of meshes shares ONE unit-cylinder
 * geometry (scaled along its length per shot) so firing allocates nothing — no
 * geometry/material/Vector3 churn mid-match, no GC hitches. Reused scratch
 * vectors keep the hot path allocation-free.
 *
 * P3: the viewmodel bobs with movement speed and sways opposite to look motion
 * (both visual-only; aim is input.yaw/pitch, untouched here).
 */

import * as THREE from 'three';
import { clamp, MOVE_SPEED, type Vec3, type WeaponId } from '@liquidate/shared';
import { Pool } from './pool';

/** Per-frame view motion that drives bob (speed) and sway (look delta). */
export interface ViewMotion {
  speed: number;
  yaw: number;
  pitch: number;
}

interface Tracer {
  mesh: THREE.Mesh;
  age: number;
  life: number;
}

const TRACER_LIFE = 0.07;
const TRACER_PREWARM = 24; // covers a shotgun blast + overlapping rifle fire
const UP = new THREE.Vector3(0, 1, 0);
const ACCENT_DEFAULT = 0x16e0a3;
const TRACER_BASE = 0xbafff0;
const WHITE = new THREE.Color(0xffffff);

export class Weapon {
  private readonly group = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;
  private readonly accentMat: THREE.MeshStandardMaterial;

  // Skin accent (P4): the viewmodel's energy bits + tracers retint to this.
  private accentValue = ACCENT_DEFAULT;
  private readonly tracerColor = new THREE.Color(TRACER_BASE);

  // Pooled tracers: one shared geometry, per-mesh material, all parented to a
  // group that stays in the scene; we toggle visibility rather than add/remove.
  private readonly tracerGroup = new THREE.Group();
  private readonly tracerGeo: THREE.CylinderGeometry;
  private readonly tracerPool: Pool<Tracer>;
  private readonly expired: Tracer[] = [];

  // Scratch vectors reused every shot (no per-shot allocation).
  private readonly vFrom = new THREE.Vector3();
  private readonly vTo = new THREE.Vector3();
  private readonly vDir = new THREE.Vector3();

  // Recoil state (smoothly returns to zero).
  private recoil = 0;
  private flashScale = 1;

  // Viewmodel rest pose + bob/sway state (P3, cosmetic).
  private readonly baseX = 0.22;
  private readonly baseY = -0.2;
  private readonly baseZ = -0.45;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private prevYaw = 0;
  private prevPitch = 0;
  private haveAim = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    // Build a simple rifle out of a few boxes, parented to the camera (ARTBIBLE:
    // low-poly matte body + emissive neon accent).
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0c1413,
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0x05100c,
      flatShading: true,
      emissive: ACCENT_DEFAULT,
      emissiveIntensity: 2.2,
      roughness: 0.4,
    });
    const accentMat = this.accentMat;

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

    // Tracer pool: a unit cylinder (length 1 along +Y, open-ended) scaled per
    // shot; each pooled mesh owns its material so it can fade independently.
    this.scene.add(this.tracerGroup);
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
    this.tracerPool = new Pool<Tracer>(
      () => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xbafff0,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(this.tracerGeo, mat);
        mesh.visible = false;
        mesh.frustumCulled = false; // thin + always near camera; skip the cull test
        this.tracerGroup.add(mesh);
        return { mesh, age: 0, life: TRACER_LIFE };
      },
      (t) => {
        t.mesh.visible = false;
        t.age = 0;
      },
      TRACER_PREWARM,
    );
  }

  /** World-space position of the muzzle, for spawning a tracer. */
  muzzleWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }

  /** Switch the viewmodel's weapon (affects muzzle flash size / recoil feel). */
  setWeapon(id: WeaponId): void {
    this.flashScale = id === 'sniper' ? 1.8 : id === 'smg' ? 0.8 : 1;
  }

  /**
   * Retint the viewmodel's accent + tracers to a skin colour (P4). Cosmetic and
   * client-local — never sent to the server, never affects aim or hits. Tracers
   * use a lightened accent so they stay readable on any skin.
   */
  setAccent(hex: number): void {
    this.accentValue = hex;
    const c = new THREE.Color(hex);
    this.accentMat.color.copy(c);
    this.accentMat.emissive.copy(c).multiplyScalar(0.35);
    this.tracerColor.copy(c).lerp(WHITE, 0.5);
  }

  /** Current accent (for tests / inspection). */
  get accent(): number {
    return this.accentValue;
  }

  /** Current tracer colour as 0xRRGGBB (for tests / inspection). */
  get tracerColorHex(): number {
    return this.tracerColor.getHex();
  }

  private flashAndKick(kick: number): void {
    const mat = this.flash.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar((0.8 + Math.random() * 0.5) * this.flashScale);
    this.flashLight.intensity = 6;
    this.recoil = Math.min(this.recoil + kick, 0.16);
  }

  /** Single-tracer shot (rifle, or any pinpoint weapon). */
  fire(hitPoint: Vec3): void {
    this.flashAndKick(0.06);
    this.muzzleWorldPosition(this.vFrom);
    this.spawnTracer(this.vFrom, hitPoint);
  }

  /** Multi-tracer shot (shotgun pellets) sharing one muzzle flash. */
  fireMany(endpoints: Vec3[]): void {
    this.flashAndKick(0.12);
    this.muzzleWorldPosition(this.vFrom);
    for (const end of endpoints) this.spawnTracer(this.vFrom, end);
  }

  /** Render a tracer for another player's shot (world-space origin and endpoint). */
  spawnWorldTracer(from: Vec3, to: Vec3): void {
    this.vFrom.set(from.x, from.y, from.z);
    this.spawnTracer(this.vFrom, to);
  }

  private spawnTracer(from: THREE.Vector3, to: Vec3): void {
    this.vTo.set(to.x, to.y, to.z);
    this.vDir.subVectors(this.vTo, from);
    const len = this.vDir.length();
    if (len < 1e-3) return;

    const t = this.tracerPool.acquire();
    const mesh = t.mesh;
    // Position at the midpoint, orient +Y along the shot, scale Y to length.
    mesh.position.copy(from).addScaledVector(this.vDir, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, this.vDir.divideScalar(len));
    mesh.scale.set(1, len, 1);
    mesh.visible = true;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.copy(this.tracerColor);
    mat.opacity = 0.9;
    t.age = 0;
    t.life = TRACER_LIFE;
  }

  /** Retire every live tracer (e.g. on match end / return to lobby). */
  reset(): void {
    this.tracerPool.releaseAll();
  }

  update(dt: number, motion?: ViewMotion): void {
    // Decay muzzle flash.
    const flashMat = this.flash.material as THREE.MeshBasicMaterial;
    if (flashMat.opacity > 0) flashMat.opacity = Math.max(0, flashMat.opacity - dt / 0.04);
    if (this.flashLight.intensity > 0)
      this.flashLight.intensity = Math.max(0, this.flashLight.intensity - (dt / 0.04) * 6);

    // Recoil recovery.
    this.recoil = Math.max(0, this.recoil - dt * 0.8);

    // Movement bob: a figure-eight that scales with speed.
    const speed = motion?.speed ?? 0;
    const run = Math.min(speed / MOVE_SPEED, 1);
    this.bobPhase += dt * (6 + speed);
    const bobX = Math.sin(this.bobPhase) * 0.012 * run;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * 0.014 * run;

    // Look sway: ease toward an offset opposite the turn; returns to rest when
    // the view is still (target collapses to 0). Cosmetic — aim is unaffected.
    let targetX = 0;
    let targetY = 0;
    if (motion) {
      if (this.haveAim) {
        targetX = clamp(-shortestAngle(this.prevYaw, motion.yaw) * 2, -0.05, 0.05);
        targetY = clamp((motion.pitch - this.prevPitch) * 2, -0.05, 0.05);
      }
      this.prevYaw = motion.yaw;
      this.prevPitch = motion.pitch;
      this.haveAim = true;
    }
    const ks = Math.min(1, dt * 12);
    this.swayX += (targetX - this.swayX) * ks;
    this.swayY += (targetY - this.swayY) * ks;

    this.group.position.set(
      this.baseX + bobX + this.swayX,
      this.baseY + bobY + this.swayY,
      this.baseZ + this.recoil,
    );
    this.group.rotation.x = this.recoil * 1.2;
    this.group.rotation.y = this.swayX * 1.6;

    // Fade active tracers; collect the expired and release them back to the pool
    // (no allocation — `expired` is a reused buffer).
    this.expired.length = 0;
    this.tracerPool.forEachActive((t) => {
      t.age += dt;
      const k = 1 - t.age / t.life;
      if (k <= 0) this.expired.push(t);
      else (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
    });
    for (const t of this.expired) this.tracerPool.release(t);
  }
}

/** Smallest signed angle from a to b, handling the ±π wrap (for sway). */
function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
