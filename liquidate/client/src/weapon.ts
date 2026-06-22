/**
 * First-person weapon viewmodel plus shot feedback: a distinct per-archetype
 * model (see weaponmodel.ts), muzzle flash, fading tracer beams, recoil kick,
 * movement bob + look sway, a per-weapon hold pose, and a reload dip. Purely
 * cosmetic — the authoritative hit math lives in @liquidate/shared.
 *
 * Part B: the equipped cosmetic SKIN repaints the model's materials (base /
 * secondary / emissive) and can animate them; `setSkin` rebuilds the model with
 * the skin's materials. Skins are client-local presentation and never affect aim
 * or hits.
 *
 * P1: tracers are pooled — a fixed set of meshes shares ONE unit-cylinder
 * geometry (scaled per shot) so firing allocates nothing.
 */

import * as THREE from 'three';
import { clamp, MOVE_SPEED, type Vec3, type WeaponId } from '@liquidate/shared';
import { Pool } from './pool';
import { buildWeaponModel, VIEWMODEL_POSE, type WeaponModel } from './weaponmodel';
import { skinMaterials, type SkinPaint } from './skinmat';
import { defaultSkinFor, weaponSkinById, type WeaponSkin } from '@liquidate/shared';

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
const TRACER_BASE = 0xbafff0;
const WHITE = new THREE.Color(0xffffff);

/** Per-weapon muzzle-flash scale (heavier guns flash bigger). */
const FLASH_SCALE: Record<WeaponId, number> = {
  assault: 1,
  smg: 0.8,
  sniper: 1.8,
  shotgun: 1.6,
  pistol: 0.7,
  lmg: 1.2,
  marksman: 1.5,
};

export class Weapon {
  private readonly group = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly flashLight: THREE.PointLight;

  private weaponId: WeaponId = 'assault';
  private model?: WeaponModel;
  private paint: SkinPaint;
  private skin: WeaponSkin;
  private loadout: Partial<Record<WeaponId, string>> = {};

  // Skin accent (P4): tracers retint to this; UI/arena use the same hue.
  private accentValue = 0x2bd96b;
  private readonly tracerColor = new THREE.Color(TRACER_BASE);

  // Pooled tracers.
  private readonly tracerGroup = new THREE.Group();
  private readonly tracerGeo: THREE.CylinderGeometry;
  private readonly tracerPool: Pool<Tracer>;
  private readonly expired: Tracer[] = [];

  // Scratch vectors reused every shot (no per-shot allocation).
  private readonly vFrom = new THREE.Vector3();
  private readonly vTo = new THREE.Vector3();
  private readonly vDir = new THREE.Vector3();

  // Recoil + reload state.
  private recoil = 0;
  private flashScale = 1;
  private reloadTarget = 0;
  private reloadAmount = 0;

  // Per-weapon hold pose + bob/sway state (cosmetic).
  private base = new THREE.Vector3(0.22, -0.2, -0.45);
  private poseRot = new THREE.Euler(0, 0, 0);
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
    // Start on the default weapon with its default (Common) skin.
    this.skin = defaultSkinFor('assault');
    this.paint = skinMaterials(this.skin);
    this.buildModel('assault');
    this.camera.add(this.group);

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
    this.group.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffd27f, 0, 8);
    this.group.add(this.flashLight);
    this.placeMuzzle();

    // Camera must be in the scene graph for its children to render.
    this.scene.add(this.camera);

    // Tracer pool: a unit cylinder scaled per shot; each mesh owns its material.
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
        mesh.frustumCulled = false;
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

  /** (Re)build the model for `id` using the current skin paint + set its pose. */
  private buildModel(id: WeaponId): void {
    if (this.model) {
      for (const m of this.model.body) m.geometry.dispose();
      for (const m of this.model.accent) m.geometry.dispose();
      this.group.remove(this.model.group);
    }
    this.weaponId = id;
    this.flashScale = FLASH_SCALE[id];
    this.model = buildWeaponModel(id, this.paint.body, this.paint.accent);
    this.group.add(this.model.group);
    this.paint.decorate(this.model.group); // attach particle fx, if any

    const pose = VIEWMODEL_POSE[id];
    this.base.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    this.poseRot.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    this.group.scale.setScalar(pose.scale);
    this.placeMuzzle();
  }

  /** Position the muzzle anchor (+ flash) at the current model's barrel tip. */
  private placeMuzzle(): void {
    const m = this.model?.muzzle ?? { x: 0, y: 0.01, z: -0.5 };
    this.muzzle.position.set(m.x, m.y, m.z);
    if (this.muzzle.parent !== this.group) this.group.add(this.muzzle);
    this.flash?.position.copy(this.muzzle.position);
    this.flashLight?.position.copy(this.muzzle.position);
  }

  /** World-space position of the muzzle, for spawning a tracer. */
  muzzleWorldPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }

  /** Switch the viewmodel's weapon, applying that weapon's equipped skin. */
  setWeapon(id: WeaponId): void {
    if (id === this.weaponId && this.model) return;
    this.applySkin(this.skinFor(id));
  }

  /** Equip a player's per-weapon skin loadout (weapon id -> skin id). */
  setLoadout(loadout: Partial<Record<WeaponId, string>>): void {
    this.loadout = { ...loadout };
    this.applySkin(this.skinFor(this.weaponId));
  }

  /** Equip a specific skin now (used by previews). Client-local cosmetic. */
  setSkin(skin: WeaponSkin): void {
    this.applySkin(skin);
  }

  /** Resolve the equipped skin for a weapon from the loadout (or its default). */
  private skinFor(id: WeaponId): WeaponSkin {
    const owned = this.loadout[id];
    const s = owned ? weaponSkinById(owned) : undefined;
    return s && s.weapon === id ? s : defaultSkinFor(id);
  }

  /**
   * Rebuild the model's materials from a skin (base / secondary / finish /
   * emissive / animation). Client-local — never sent to the server, never affects
   * aim or hits.
   */
  private applySkin(skin: WeaponSkin): void {
    const old = this.paint;
    this.skin = skin;
    this.paint = skinMaterials(skin);
    this.setAccent(this.paint.accentHex); // tracers read on-theme
    this.buildModel(skin.weapon);
    old.dispose(); // free the previous skin's materials/fx after the rebuild
  }

  /**
   * Retint the tracer colour to a hue (P4). Cosmetic and client-local. Tracers
   * use a lightened accent so they stay readable on any colour.
   */
  setAccent(hex: number): void {
    this.accentValue = hex;
    const c = new THREE.Color(hex);
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

  /** Drive the reload dip (call with the authoritative reloading flag). */
  setReloading(reloading: boolean): void {
    this.reloadTarget = reloading ? 1 : 0;
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

    // Recoil recovery + reload dip easing.
    this.recoil = Math.max(0, this.recoil - dt * 0.8);
    this.reloadAmount += (this.reloadTarget - this.reloadAmount) * Math.min(1, dt * 9);

    // Animate the skin (pulse/flow/rainbow + particle aura), if any.
    this.paint.update?.(dt);

    // Movement bob: a figure-eight that scales with speed.
    const speed = motion?.speed ?? 0;
    const run = Math.min(speed / MOVE_SPEED, 1);
    this.bobPhase += dt * (6 + speed);
    const bobX = Math.sin(this.bobPhase) * 0.012 * run;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * 0.014 * run;

    // Look sway: ease toward an offset opposite the turn; returns to rest.
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

    const dip = this.reloadAmount;
    this.group.position.set(
      this.base.x + bobX + this.swayX,
      this.base.y + bobY + this.swayY - dip * 0.12,
      this.base.z + this.recoil,
    );
    this.group.rotation.set(
      this.poseRot.x + this.recoil * 1.2 + dip * 0.5,
      this.poseRot.y + this.swayX * 1.6 - dip * 0.3,
      this.poseRot.z,
    );

    // Fade active tracers; release the expired (reused buffer, no allocation).
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
