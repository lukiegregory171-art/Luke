/**
 * A real rigged glTF avatar (CC0 "RobotExpressive" — see ATTRIBUTION.md) driven
 * by a `THREE.AnimationMixer` with crossfades, used for networked opponents and
 * the practice bot when the avatar asset is loaded (else the procedural figure in
 * character.ts is the fallback). Implements the {@link Avatar} surface.
 *
 * Clip mapping (the pack's clips → our semantic states):
 *   idle→Idle  run→Running  jump→Jump  death→Death  shoot→Punch  reload→Wave
 *
 * PURELY COSMETIC. Placed from authoritative server state; the animation moves
 * only the skinned mesh, never a hitbox (server hitboxes are spheres from feet).
 * Team colour is applied as a per-instance material tint so teams stay readable,
 * and the held weapon hangs off the right-hand bone socket.
 */

import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER_HEIGHT, weaponSkinById, type WeaponId, type WeaponSkin } from '@liquidate/shared';
import { getAvatarSource } from './avatarsource';
import { buildWeaponModel, type WeaponModel } from './weaponmodel';
import type { CharacterColors } from './character';
import { DEBUG_BOTS } from './debug';

const CLIP = {
  idle: 'Idle',
  run: 'Running',
  jump: 'Jump',
  death: 'Death',
  shoot: 'Punch',
  reload: 'Wave',
} as const;

const RUN_THRESHOLD = 1.2; // m/s above which we play the run cycle
const SHOOT_MS = 240; // how long the shoot overlay holds
const MODEL_FACING = Math.PI; // pack faces +Z; our forward is -Z

export class RiggedCharacter {
  readonly root = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly tintMats: THREE.MeshStandardMaterial[] = [];
  private readonly disposables: (THREE.Material | THREE.BufferGeometry)[] = [];

  private current?: THREE.AnimationAction;
  private currentName = '';
  private alive = true;
  private airborne = false;
  private reloading = false;
  private shootUntil = 0;
  private readonly rigScale: number;

  // Held weapon on the right-hand bone socket.
  private readonly handSocket = new THREE.Group();
  private readonly heldBody = new THREE.MeshStandardMaterial({ color: 0x3a4754, flatShading: true, roughness: 0.85 });
  private readonly heldAccent = new THREE.MeshStandardMaterial({ color: 0x2bd96b, flatShading: true, roughness: 0.6, metalness: 0.3 });
  private heldModel?: WeaponModel;
  private heldWeaponId?: WeaponId;

  constructor(
    private readonly scene: THREE.Scene,
    colors: CharacterColors,
  ) {
    const src = getAvatarSource();
    if (!src) throw new Error('RiggedCharacter: no avatar source loaded');

    this.model = cloneSkeleton(src.scene);

    // Per-instance materials so team tint is independent across avatars.
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        this.disposables.push(c);
        // The pack's body material is named "Main" — tint it to the team colour.
        if (c instanceof THREE.MeshStandardMaterial && /main/i.test(c.name)) this.tintMats.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
    });

    // Normalise to player height, feet on the ground, facing -Z at yaw 0.
    this.model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    // Guard a degenerate bounding box (would otherwise scale the model to ~0 or
    // a NaN, leaving an invisible/garbage avatar).
    let scale = PLAYER_HEIGHT / (size.y || 1);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    this.rigScale = THREE.MathUtils.clamp(scale, 0.05, 50);
    const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
    const rig = new THREE.Group();
    rig.add(this.model);
    rig.scale.setScalar(this.rigScale);
    rig.position.y = -minY * this.rigScale;
    rig.rotation.y = MODEL_FACING;
    this.root.add(rig);
    this.root.visible = false;
    scene.add(this.root);

    if (DEBUG_BOTS) {
      let meshes = 0;
      this.model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      console.warn('[avatar] rig built', {
        rigScale: +this.rigScale.toFixed(3),
        size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
        minY: +minY.toFixed(2),
        meshes,
        clips: src.clips.length,
      });
    }

    // Right-hand bone socket for the held weapon.
    const hand = this.model.getObjectByName('Hand.R') ?? this.model.getObjectByName('Hand.L');
    if (hand) {
      this.handSocket.scale.setScalar(1.1 / this.rigScale); // ~world-scale the gun
      hand.add(this.handSocket);
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of src.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));

    this.setTeam(colors.team);
    this.buildHeld('assault');
    this.play(CLIP.idle);
  }

  setTeam(color: number): void {
    for (const m of this.tintMats) {
      m.color.setHex(color);
      m.emissive.setHex(color);
      m.emissiveIntensity = 0.18;
    }
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.root.visible = true;
  }

  setAlive(alive: boolean): void {
    this.alive = alive;
  }

  setAirborne(airborne: boolean): void {
    this.airborne = airborne;
  }

  setReloading(reloading: boolean): void {
    this.reloading = reloading;
  }

  triggerShoot(): void {
    this.shootUntil = performance.now() + SHOOT_MS;
  }

  update(dt: number, speed: number): void {
    this.mixer.update(dt);
    if (this.alive) this.root.visible = true;

    let want: string;
    if (!this.alive) want = CLIP.death;
    else if (this.reloading) want = CLIP.reload;
    else if (this.airborne) want = CLIP.jump;
    else if (performance.now() < this.shootUntil) want = CLIP.shoot;
    else want = speed > RUN_THRESHOLD ? CLIP.run : CLIP.idle;

    if (want !== this.currentName) {
      const oneShot = want === CLIP.death || want === CLIP.jump || want === CLIP.shoot;
      this.play(want, !oneShot, oneShot);
    }
  }

  private play(name: string, loop = true, once = false): void {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.clampWhenFinished = once;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    if (this.current) next.crossFadeFrom(this.current, 0.18, false);
    next.play();
    this.current = next;
    this.currentName = name;
  }

  private buildHeld(id: WeaponId): void {
    if (this.heldModel) {
      for (const m of [...this.heldModel.body, ...this.heldModel.accent]) m.geometry.dispose();
      this.handSocket.remove(this.heldModel.group);
    }
    this.heldWeaponId = id;
    this.heldModel = buildWeaponModel(id, this.heldBody, this.heldAccent);
    // Orient the gun in the hand (best-effort; tune from here visually).
    this.heldModel.group.position.set(0, 0, -0.2);
    this.handSocket.add(this.heldModel.group);
  }

  setHeld(weapon: WeaponId, skinId: string | undefined): void {
    if (weapon !== this.heldWeaponId) this.buildHeld(weapon);
    const skin: WeaponSkin | undefined = skinId ? weaponSkinById(skinId) : undefined;
    this.heldBody.color.set(skin ? skin.base : '#3a4754');
    const accent = skin ? (skin.emissiveColor ?? skin.secondary) : '#2bd96b';
    this.heldAccent.color.set(accent);
    if (skin?.emissive) {
      this.heldAccent.emissive.set(skin.emissiveColor ?? skin.secondary);
      this.heldAccent.emissiveIntensity = 0.7;
    } else {
      this.heldAccent.emissive.setHex(0x000000);
      this.heldAccent.emissiveIntensity = 0;
    }
  }

  reset(): void {
    this.alive = true;
    this.airborne = false;
    this.reloading = false;
    this.root.visible = false;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.heldBody.dispose();
    this.heldAccent.dispose();
    this.scene.remove(this.root);
  }
}
