/**
 * Three.js scene built from the shared map data. The geometry here is derived
 * from the SAME `GameMap` the server uses for collision/occlusion, so what you
 * see is what you collide with and shoot against.
 */

import * as THREE from 'three';
import type { GameMap } from '@liquidate/shared';

const COLORS = {
  sky: 0x0a1119,
  fog: 0x0a1119,
  floor: 0x10171f,
  grid: 0x16e0a3,
  wall: 0x141b24,
  obstacle: 0x1b2733,
  edge: 0x16e0a3,
};

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  constructor(
    private readonly container: HTMLElement,
    map: GameMap,
  ) {
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.fog, 18, Math.max(map.width, map.depth) * 1.4);

    this.camera = new THREE.PerspectiveCamera(
      82,
      window.innerWidth / window.innerHeight,
      0.05,
      500,
    );
    this.camera.rotation.order = 'YXZ'; // yaw (Y) then pitch (X) => matches shared aimDirection

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.buildLights();
    this.buildArena(map);

    window.addEventListener('resize', this.handleResize);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0x9fd4ff, 0x0a0f14, 1.1);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(8, 20, 6);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x16e0a3, 0.6);
    fill.position.set(-10, 8, -8);
    this.scene.add(fill);
  }

  private buildArena(map: GameMap): void {
    // Floor.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(map.width, map.depth),
      new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Neon grid over the floor for an arena feel.
    const grid = new THREE.GridHelper(
      Math.max(map.width, map.depth),
      Math.max(map.width, map.depth),
      COLORS.grid,
      0x0d3b2e,
    );
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.02;
    this.scene.add(grid);

    // Perimeter walls.
    const halfW = map.width / 2;
    const halfD = map.depth / 2;
    const h = map.wallHeight;
    const t = 0.4;
    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9 });
    const walls: [number, number, number, number][] = [
      [0, -halfD, map.width, t], // back
      [0, halfD, map.width, t], // front
      [-halfW, 0, t, map.depth], // left
      [halfW, 0, t, map.depth], // right
    ];
    for (const [cx, cz, sx, sz] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
      wall.position.set(cx, h / 2, cz);
      this.scene.add(wall);
    }

    // Obstacles (cover) — solid box plus a neon wireframe edge.
    const obsMat = new THREE.MeshStandardMaterial({
      color: COLORS.obstacle,
      roughness: 0.7,
      metalness: 0.25,
    });
    for (const box of map.obstacles) {
      const sx = box.max.x - box.min.x;
      const sy = box.max.y - box.min.y;
      const sz = box.max.z - box.min.z;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geo, obsMat);
      mesh.position.set(
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        (box.min.z + box.max.z) / 2,
      );
      this.scene.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.5 }),
      );
      edges.position.copy(mesh.position);
      this.scene.add(edges);
    }
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
