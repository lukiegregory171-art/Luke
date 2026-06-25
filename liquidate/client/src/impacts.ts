/**
 * Impact effects (P3) — a quick additive flash plus an outward spark burst at
 * the point a shot lands, colour-coded for surface (warm) vs flesh (red). Pooled
 * via the P1 {@link Pool}: a fixed set of impacts is recycled, so a firefight
 * (including 8-pellet shotgun blasts) spawns effects with zero per-shot
 * allocation — no GC churn.
 *
 * Client-only presentation: this draws where the client's tracer/endpoint math
 * says a shot ended. It's decorative; hits, damage, and kills are decided
 * server-side and arrive as events.
 *
 * LIMITATION: impacts are camera-facing flashes, not surface-aligned bullet
 * decals — those need a hit normal the server doesn't send. Oriented, lingering
 * decals are a P5 (environment art) enhancement; faking a normal here would look
 * wrong, so we don't.
 */

import * as THREE from 'three';
import type { Vec3 } from '@liquidate/shared';
import { Pool } from './pool';

export type ImpactKind = 'surface' | 'flesh';

interface Impact {
  group: THREE.Group;
  flash: THREE.Mesh;
  sparks: THREE.Points;
  flashMat: THREE.MeshBasicMaterial;
  sparkMat: THREE.PointsMaterial;
  age: number;
  life: number;
}

const LIFE = 0.18; // seconds
const SPARK_COUNT = 10;
const SPARK_REACH = 0.9; // metres the burst expands to
const COLOR: Record<ImpactKind, number> = { surface: 0xffe6a0, flesh: 0xff5a5a };

export class Impacts {
  private readonly root = new THREE.Group();
  private readonly pool: Pool<Impact>;
  private readonly expired: Impact[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.pool = new Pool<Impact>(
      () => this.make(),
      (im) => {
        im.group.visible = false;
        im.age = 0;
      },
      16,
    );
  }

  private make(): Impact {
    const group = new THREE.Group();
    group.visible = false;

    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);

    // Fixed random directions; we scale the whole cloud outward + fade it,
    // rather than animating per-point velocities (cheap, no per-spawn alloc).
    const pos = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const z = Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      const r = 0.4 + Math.random() * 0.6;
      pos[i * 3] = (x / len) * r;
      pos[i * 3 + 1] = (y / len) * r;
      pos[i * 3 + 2] = (z / len) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparks = new THREE.Points(geo, sparkMat);

    group.add(flash, sparks);
    this.root.add(group);
    return { group, flash, sparks, flashMat, sparkMat, age: 0, life: LIFE };
  }

  /** Spawn an impact at a world point. `kind` only tints it. */
  spawn(point: Vec3, kind: ImpactKind): void {
    const im = this.pool.acquire();
    im.group.position.set(point.x, point.y, point.z);
    im.age = 0;
    im.life = LIFE;
    const c = COLOR[kind];
    im.flashMat.color.setHex(c);
    im.flashMat.opacity = 0.9;
    im.flash.scale.setScalar(0.3);
    im.sparkMat.color.setHex(c);
    im.sparkMat.opacity = 1;
    im.sparks.scale.setScalar(0.01);
    im.group.visible = true;
  }

  /** Advance + fade all live impacts; billboard their flashes toward the camera. */
  update(dt: number, camera: THREE.Camera): void {
    this.expired.length = 0;
    this.pool.forEachActive((im) => {
      im.age += dt;
      const k = im.age / im.life;
      if (k >= 1) {
        this.expired.push(im);
        return;
      }
      im.flash.quaternion.copy(camera.quaternion);
      im.flash.scale.setScalar(0.3 + k * 0.8);
      im.flashMat.opacity = (1 - k) * 0.9;
      im.sparks.scale.setScalar(Math.max(0.01, k * SPARK_REACH));
      im.sparkMat.opacity = 1 - k;
    });
    for (const im of this.expired) this.pool.release(im);
  }

  /** Retire all live impacts (e.g. on match end). */
  reset(): void {
    this.pool.releaseAll();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }
}
