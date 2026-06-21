/**
 * Animated player character (P2). A procedural articulated humanoid — torso,
 * head + visor, two arms, two legs — that animates from movement: a run cycle
 * whose cadence/amplitude scale with speed, an idle breathing pose when still,
 * and a topple on death.
 *
 * COSMETIC-ONLY, and this is load-bearing: animation moves only CHILD limbs,
 * never the root. The root tracks the authoritative feet position exactly, and
 * hurtboxes are a pure function of that position (`hurtboxes(feet)` in shared) —
 * so no limb swing, lean, or death topple can ever move the player or shift a
 * hitbox. What you shoot is the server's sphere, not the animated mesh. The rig
 * is also SIZED to the hurtbox capsule (head sphere at HEAD_SPHERE.centerY, body
 * mass around BODY_SPHERE.centerY) so what you see ≈ what you hit.
 *
 * Used by BOTH the networked opponent and the practice bot (one rig, team tint
 * via options) — no duplicated avatar code.
 *
 * LIMITATION: this is the zero-asset procedural rig. The drop-in slot for a real
 * rigged glTF (skinned mesh + AnimationMixer with named idle/run/death clips,
 * loaded via the P1 AssetManager) is documented in docs/assets.md; nothing here
 * fakes skeletal skinning.
 */

import * as THREE from 'three';
import { HEAD_SPHERE, MOVE_SPEED } from '@liquidate/shared';
import { matte, neon } from './palette';

export interface CharacterColors {
  body: number; // dark matte body
  team: number; // bright emissive team colour (visor + chest + ground ring)
}

const HIP_Y = 0.92; // leg pivot height
const SHOULDER_Y = 1.42; // arm pivot height
const LEG_LEN = HIP_Y; // legs reach the floor
const ARM_LEN = 0.58;
const DEATH_TIME = 0.35; // seconds to topple

/** A limb that pivots at its TOP (shoulder/hip): rotate the group to swing it. */
function makeLimb(len: number, w: number, d: number, mat: THREE.Material, pivotY: number, x: number) {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  mesh.position.y = -len / 2; // hang below the pivot
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export class Character {
  /** Root — placed at the authoritative feet position. Never animated. */
  readonly root = new THREE.Group();

  private readonly frame = new THREE.Group(); // bobs/topples; holds the body
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly mats: THREE.Material[] = [];
  private readonly teamMat: THREE.MeshStandardMaterial;

  private phase = 0; // walk-cycle phase
  private idle = 0; // idle-breathing phase
  private deathT = 0; // 0..1 death progress
  private alive = true;

  constructor(
    private readonly scene: THREE.Scene,
    colors: CharacterColors,
  ) {
    // ARTBIBLE: dark matte body, bright team-colour emissive accents. Low-poly
    // flat-shaded so the silhouette reads; the team glow is what you track.
    const bodyMat = matte(colors.body);
    const teamMat = neon(colors.team, 2.4); // shared by visor + chest + ground ring
    this.teamMat = teamMat;
    this.mats.push(bodyMat, teamMat);

    // Torso (chest tapering to waist), centred on the body hurtsphere height.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.62, 8), bodyMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    torso.name = 'torso';
    // Emissive chest plate (front-facing team glow).
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.06), teamMat);
    chest.position.set(0, 1.22, -0.21);

    // Head (dark) + forward visor (team glow — reads which way they face).
    const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_SPHERE.radius, 8, 6), bodyMat);
    head.position.y = HEAD_SPHERE.centerY;
    head.castShadow = true;
    head.name = 'head';
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), teamMat);
    visor.position.set(0, HEAD_SPHERE.centerY, -HEAD_SPHERE.radius);

    this.legL = makeLimb(LEG_LEN, 0.16, 0.18, bodyMat, HIP_Y, -0.13);
    this.legR = makeLimb(LEG_LEN, 0.16, 0.18, bodyMat, HIP_Y, 0.13);
    this.armL = makeLimb(ARM_LEN, 0.12, 0.13, bodyMat, SHOULDER_Y, -0.3);
    this.armR = makeLimb(ARM_LEN, 0.12, 0.13, bodyMat, SHOULDER_Y, 0.3);
    this.legL.name = 'legL';
    this.legR.name = 'legR';
    this.armL.name = 'armL';
    this.armR.name = 'armR';

    this.frame.add(torso, chest, head, visor, this.legL, this.legR, this.armL, this.armR);
    this.root.add(this.frame);

    // Ground ring stays on the floor (on the root, not the animated frame), so it
    // never bobs or topples — a clean readable footprint under the player.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 28), teamMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.name = 'ring';
    this.root.add(ring);

    this.root.visible = false;
    this.scene.add(this.root);
  }

  /** Recolor the team accents (visor/chest/ground ring) — e.g. ally vs enemy. */
  setTeam(color: number): void {
    this.teamMat.emissive.setHex(color); // neon glow is the team colour
  }

  /** Place the root at the authoritative feet position + facing (no animation). */
  place(x: number, y: number, z: number, yaw: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
  }

  /** Flip alive/dead; (re)starts the death topple or restores the upright pose. */
  setAlive(alive: boolean): void {
    if (alive === this.alive) return;
    this.alive = alive;
    if (alive) {
      this.deathT = 0;
      this.frame.rotation.x = 0;
      this.frame.position.set(0, 0, 0);
      this.root.visible = true;
    }
  }

  /**
   * Advance the cosmetic animation. `speed` is horizontal m/s; when ~0 the rig
   * idles. Limbs only — never touches the root transform.
   */
  update(dt: number, speed: number): void {
    if (!this.alive) {
      this.animateDeath(dt);
      return;
    }
    this.root.visible = true;

    const run = Math.min(speed / MOVE_SPEED, 1);
    // Cadence rises with speed; amplitude scales from idle (0) to full stride.
    this.phase += dt * (5 + speed * 1.6);
    const swing = run * 0.8;
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.armL.rotation.x = -s * swing * 0.85;
    this.armR.rotation.x = s * swing * 0.85;

    // Idle breathing when still; a slight vertical bounce when running.
    this.idle += dt;
    const breathe = (1 - run) * Math.sin(this.idle * 2.2) * 0.02;
    const bounce = run * Math.abs(Math.cos(this.phase)) * 0.05;
    this.frame.position.y = breathe + bounce;
  }

  private animateDeath(dt: number): void {
    this.deathT = Math.min(1, this.deathT + dt / DEATH_TIME);
    // Topple forward and sink slightly; then leave the field clear.
    this.frame.rotation.x = this.deathT * 1.45;
    this.frame.position.y = -this.deathT * 0.15;
    if (this.deathT >= 1) this.root.visible = false;
  }

  /** Hide + reset between matches. */
  reset(): void {
    this.alive = true;
    this.deathT = 0;
    this.frame.rotation.x = 0;
    this.frame.position.set(0, 0, 0);
    this.root.visible = false;
  }

  /** Free GPU resources (geometries are per-instance; materials are shared here). */
  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.scene.remove(this.root);
  }
}
