import * as THREE from '/vendor/three.module.js';

// Lightweight, self-expiring visual effects: muzzle flashes, tracers, and
// rocket explosions. update() is called once per rendered frame.

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }

  muzzleFlash(position) {
    const light = new THREE.PointLight(0xffcc66, 4, 6, 2);
    light.position.copy(position);
    this.scene.add(light);
    this.active.push({ mesh: light, life: 0.05, maxLife: 0.05, kind: 'light' });

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd77a, transparent: true, opacity: 0.9 }));
    sprite.scale.set(0.35, 0.35, 0.35);
    sprite.position.copy(position);
    this.scene.add(sprite);
    this.active.push({ mesh: sprite, life: 0.05, maxLife: 0.05, kind: 'sprite' });
  }

  tracer(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 4, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.08, maxLife: 0.08, kind: 'tracer' });
  }

  explosion(position, radius) {
    const geo = new THREE.SphereGeometry(0.3, 12, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.active.push({ mesh, life: 0.35, maxLife: 0.35, kind: 'explosion', targetScale: Math.max(1, radius * 0.8) });

    const light = new THREE.PointLight(0xff8a3d, 6, radius * 3, 2);
    light.position.copy(position);
    this.scene.add(light);
    this.active.push({ mesh: light, life: 0.25, maxLife: 0.25, kind: 'light' });
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      fx.life -= dt;
      const t = 1 - Math.max(0, fx.life) / fx.maxLife;

      if (fx.kind === 'light') {
        fx.mesh.intensity *= 0.85;
      } else if (fx.kind === 'sprite' || fx.kind === 'tracer') {
        fx.mesh.material.opacity *= 0.8;
      } else if (fx.kind === 'explosion') {
        const s = 0.3 + t * fx.targetScale;
        fx.mesh.scale.set(s, s, s);
        fx.mesh.material.opacity = 0.9 * (1 - t);
      }

      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry?.dispose?.();
        fx.mesh.material?.dispose?.();
        this.active.splice(i, 1);
      }
    }
  }
}
