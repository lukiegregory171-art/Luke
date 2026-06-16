/**
 * A practice target dummy. Its visible body/head meshes are sized to match the
 * shared hurtbox spheres, and hit detection uses `hurtboxes()` from
 * @liquidate/shared — the exact function the server will use for real players.
 * When dropped it briefly falls, then respawns at a fresh spot.
 */

import * as THREE from 'three';
import {
  BODY_SPHERE,
  HEAD_SPHERE,
  MAX_HEALTH,
  hurtboxes,
  type GameMap,
  type Vec3,
} from '@liquidate/shared';

const RESPAWN_DELAY = 0.8;

export class Dummy {
  private readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly barBg: THREE.Sprite;
  private readonly bar: THREE.Sprite;

  feet: Vec3 = { x: 0, y: 0, z: 0 };
  health = MAX_HEALTH;
  alive = true;

  /** Point the dummy keeps its distance from (the player). Overridden by the
   *  game so respawns never land on top of you; defaults to player spawn 0. */
  avoidProvider: () => Vec3;

  private flash = 0;
  private deadTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly map: GameMap,
  ) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.6 });
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_SPHERE.radius, BODY_SPHERE.centerY * 1.1, 6, 12),
      skin,
    );
    this.body.position.y = BODY_SPHERE.centerY;

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_SPHERE.radius, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xff6a7d, roughness: 0.5 }),
    );
    this.head.position.y = HEAD_SPHERE.centerY;

    this.group.add(this.body, this.head);

    this.barBg = makeBar(0x222a33, 0.7);
    this.bar = makeBar(0x16e0a3, 0.72);
    this.barBg.position.set(0, HEAD_SPHERE.centerY + 0.4, 0);
    this.bar.position.copy(this.barBg.position);
    this.bar.position.z += 0.001;
    this.group.add(this.barBg, this.bar);

    this.avoidProvider = () => map.spawns[0].pos;
    this.scene.add(this.group);
    this.respawn(true);
  }

  hurtboxes(): {
    body: ReturnType<typeof hurtboxes>['body'];
    head: ReturnType<typeof hurtboxes>['head'];
  } {
    return hurtboxes(this.feet);
  }

  /** Apply damage; returns true if this shot dropped the dummy. */
  damage(amount: number): boolean {
    if (!this.alive) return false;
    this.health -= amount;
    this.flash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deadTimer = RESPAWN_DELAY;
      return true;
    }
    return false;
  }

  private respawn(initial = false): void {
    this.feet = this.pickSpot();
    this.health = MAX_HEALTH;
    this.alive = true;
    this.group.position.set(this.feet.x, 0, this.feet.z);
    this.group.rotation.z = 0;
    this.group.visible = true;
    if (initial) this.flash = 0;
  }

  /** Choose an open spot inside the arena, away from cover and the player. */
  private pickSpot(): Vec3 {
    const halfW = this.map.width / 2 - 2;
    const halfD = this.map.depth / 2 - 2;
    const avoid = this.avoidProvider();
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() * 2 - 1) * halfW;
      const z = (Math.random() * 2 - 1) * halfD;
      if (Math.hypot(x - avoid.x, z - avoid.z) < 9) continue;
      if (this.insideAnyObstacle(x, z)) continue;
      return { x, y: 0, z };
    }
    // Fallback: opposite end of the arena from the avoided point.
    return { x: 0, y: 0, z: -Math.sign(avoid.z || 1) * halfD };
  }

  private insideAnyObstacle(x: number, z: number): boolean {
    const m = BODY_SPHERE.radius + 0.5;
    return this.map.obstacles.some(
      (b) => x > b.min.x - m && x < b.max.x + m && z > b.min.z - m && z < b.max.z + m,
    );
  }

  update(dt: number): void {
    // Hit flash on the body/head materials.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      const e = new THREE.Color(0xff3344).multiplyScalar(this.flash);
      (this.body.material as THREE.MeshStandardMaterial).emissive = e;
      (this.head.material as THREE.MeshStandardMaterial).emissive = e;
    }

    // Health bar fill.
    const frac = this.health / MAX_HEALTH;
    this.bar.scale.x = 0.72 * frac;
    this.bar.position.x = -(0.72 * (1 - frac)) / 2;
    this.barBg.visible = this.bar.visible = this.alive && frac < 1;

    if (!this.alive) {
      // Topple, then respawn.
      this.group.rotation.z = Math.min(this.group.rotation.z + dt * 6, Math.PI / 2);
      this.group.position.y = Math.max(this.group.position.y - dt * 1.5, -0.4);
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.group.position.y = 0;
        this.respawn();
      }
    }
  }
}

function makeBar(color: number, width: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ color, depthTest: false, transparent: true }),
  );
  sprite.scale.set(width, 0.08, 1);
  return sprite;
}
