/**
 * The remote player, rendered with entity interpolation: snapshots are buffered
 * and the avatar is drawn ~100 ms in the past, lerping between the two snapshots
 * that bracket the render time. This trades a little latency for smooth motion.
 */

import * as THREE from 'three';
import { BODY_SPHERE, HEAD_SPHERE } from '@liquidate/shared';

interface Frame {
  t: number; // server time (ms)
  x: number;
  z: number;
  yaw: number;
  alive: boolean;
}

const MAX_FRAMES = 40;

export class Opponent {
  private readonly group = new THREE.Group();
  private readonly buffer: Frame[] = [];

  constructor(private readonly scene: THREE.Scene) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(BODY_SPHERE.radius, BODY_SPHERE.centerY * 1.1, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.5, metalness: 0.1 }),
    );
    body.position.y = BODY_SPHERE.centerY;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_SPHERE.radius, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xffd27f, roughness: 0.4, emissive: 0x331100 }),
    );
    head.position.y = HEAD_SPHERE.centerY;

    // A little "visor" so you can read which way they're facing.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.06, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x16e0a3, emissive: 0x0c5a42 }),
    );
    visor.position.set(0, HEAD_SPHERE.centerY, -HEAD_SPHERE.radius);

    body.castShadow = true;
    head.castShadow = true;
    this.group.add(body, head, visor);
    this.group.visible = false;
    this.scene.add(this.group);
  }

  /** Clear interpolation state between matches and hide the avatar. */
  reset(): void {
    this.buffer.length = 0;
    this.group.visible = false;
  }

  pushFrame(serverTime: number, x: number, z: number, yaw: number, alive: boolean): void {
    this.buffer.push({ t: serverTime, x, z, yaw, alive });
    if (this.buffer.length > MAX_FRAMES) this.buffer.shift();
  }

  /** Render the opponent at the given (server-time) render moment. */
  update(renderTime: number): void {
    if (this.buffer.length === 0) {
      this.group.visible = false;
      return;
    }

    // Find the two frames bracketing renderTime.
    let older = this.buffer[0];
    let newer = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].t <= renderTime && this.buffer[i + 1].t >= renderTime) {
        older = this.buffer[i];
        newer = this.buffer[i + 1];
        break;
      }
    }

    const span = newer.t - older.t;
    const f = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.t) / span)) : 0;

    const x = older.x + (newer.x - older.x) * f;
    const z = older.z + (newer.z - older.z) * f;
    const yaw = older.yaw + shortestAngle(older.yaw, newer.yaw) * f;

    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    this.group.visible = newer.alive;
  }
}

function shortestAngle(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
