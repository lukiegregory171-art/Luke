/**
 * Three.js scene + modern render pipeline (P0). Geometry is still derived from
 * the SAME shared `GameMap` the server uses for collision/occlusion — what you
 * see is what you collide with. NONE of this rendering touches authority.
 *
 * Pipeline: linear/sRGB workflow with ACES filmic tone mapping, image-based
 * lighting (procedural RoomEnvironment via PMREM — zero external art, with a
 * slot to drop in an HDRI later), a sun/key + hemisphere fill + neon rim light
 * rig with soft (PCF) shadows, and a pmndrs post stack (bloom / SMAA / vignette
 * / film grain / ACES tone-map). Quality presets + dynamic resolution scaling
 * hold the frame rate; a perf HUD reports the cost.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { GameMap } from '@liquidate/shared';
import {
  QUALITY,
  savedQuality,
  saveQuality,
  type QualityLevel,
  type QualitySettings,
} from './quality';
import type { PerfHud } from './perf';

const ACCENT = 0x16e0a3;

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private composer!: EffectComposer;
  private readonly arena = new THREE.Group();
  private readonly key: THREE.DirectionalLight;
  private quality: QualitySettings;
  private level: QualityLevel;
  private renderScale = 1;
  private avgMs = 16.7;
  private dpr = Math.min(window.devicePixelRatio, 2);

  constructor(
    private readonly container: HTMLElement,
    private readonly perf: PerfHud,
  ) {
    this.scene.background = new THREE.Color(0x0c1420);
    this.scene.fog = new THREE.Fog(0x0c1420, 26, 80);

    this.camera = new THREE.PerspectiveCamera(
      82,
      window.innerWidth / window.innerHeight,
      0.05,
      500,
    );
    this.camera.rotation.order = 'YXZ'; // yaw (Y) then pitch (X) => matches shared aimDirection

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // SMAA in the post stack handles AA
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.NoToneMapping; // ACES applied in the composer
    this.renderer.info.autoReset = false; // reset once/frame so draw-call stats cover all passes
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Image-based lighting from a procedural room (reflections + soft ambient).
    // LIMITATION: a real Poly Haven HDRI would look better; this is the
    // zero-external-art layer, with scene.environment as the drop-in slot.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Light rig: warm key (sun) with shadows, cool hemisphere fill, neon rim,
    // and a low ambient lift so shadowed areas never crush to pure black.
    this.key = new THREE.DirectionalLight(0xfff2e0, 3.2);
    this.key.position.set(12, 24, 8);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.04;
    this.scene.add(this.key, this.key.target);

    const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x202832, 1.4);
    const rim = new THREE.DirectionalLight(ACCENT, 1.0);
    rim.position.set(-12, 9, -14);
    const ambient = new THREE.AmbientLight(0x2a3a4e, 0.5);
    this.scene.add(hemi, rim, ambient);

    this.scene.add(this.arena);

    this.level = savedQuality();
    this.quality = QUALITY[this.level];
    this.buildComposer();
    this.applyQuality(this.level);

    window.addEventListener('resize', this.handleResize);
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get qualityLevel(): QualityLevel {
    return this.level;
  }

  /** Build (or rebuild) the arena geometry for the given map. */
  setMap(map: GameMap): void {
    this.arena.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.arena.clear();
    this.scene.fog = new THREE.Fog(0x0c1420, 20, Math.max(map.width, map.depth) * 1.7);
    this.buildArena(map);
    this.fitShadowCamera(map);
  }

  /** Fit the (single-cascade) shadow camera tightly to the arena for crisp shadows. */
  private fitShadowCamera(map: GameMap): void {
    const r = Math.max(map.width, map.depth) * 0.62;
    const cam = this.key.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 70;
    cam.updateProjectionMatrix();
    this.key.target.position.set(0, 0, 0);
  }

  private buildArena(map: GameMap): void {
    // Polished dark-metal floor (reflects the environment + neon).
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1b2735,
      metalness: 0.35,
      roughness: 0.5,
      envMapIntensity: 1.2,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arena.add(floor);

    // Emissive neon grid (blooms).
    const grid = new THREE.GridHelper(
      Math.max(map.width, map.depth),
      Math.max(map.width, map.depth),
      ACCENT,
      0x0d3b2e,
    );
    const gm = grid.material as THREE.Material;
    gm.opacity = 0.35;
    gm.transparent = true;
    grid.position.y = 0.02;
    this.arena.add(grid);

    // Perimeter walls.
    const halfW = map.width / 2;
    const halfD = map.depth / 2;
    const h = map.wallHeight;
    const t = 0.4;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x232f3b,
      metalness: 0.2,
      roughness: 0.7,
    });
    const walls: [number, number, number, number][] = [
      [0, -halfD, map.width, t],
      [0, halfD, map.width, t],
      [-halfW, 0, t, map.depth],
      [halfW, 0, t, map.depth],
    ];
    for (const [cx, cz, sx, sz] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), wallMat);
      wall.position.set(cx, h / 2, cz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.arena.add(wall);
    }

    // Cover obstacles: PBR box + bright neon edge that blooms.
    const obsMat = new THREE.MeshStandardMaterial({
      color: 0x2b3b49,
      metalness: 0.3,
      roughness: 0.5,
      envMapIntensity: 1.1,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0.85,
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.arena.add(mesh);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(mesh.position);
      this.arena.add(edges);
    }
  }

  // --- Post-processing + quality --------------------------------------------

  private buildComposer(): void {
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Ground-contact ambient occlusion (high/ultra) — darkens crevices and where
    // cover meets the floor. Applied to the linear render before bloom/tonemap.
    if (this.quality.ssao) {
      const ao = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
      ao.configuration.aoRadius = 1.6;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = 2.4;
      ao.setQualityMode(this.level === 'ultra' ? 'High' : 'Medium');
      this.composer.addPass(ao);
    }

    const effects = [];
    if (this.quality.bloom) {
      effects.push(
        new BloomEffect({
          intensity: 0.9,
          luminanceThreshold: 0.7,
          luminanceSmoothing: 0.25,
          mipmapBlur: true,
          radius: 0.7,
        }),
      );
    }
    if (this.quality.vignette) effects.push(new VignetteEffect({ darkness: 0.5, offset: 0.32 }));
    if (this.quality.grain) {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY });
      noise.blendMode.opacity.value = 0.045;
      effects.push(noise);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
    if (this.quality.smaa) effects.push(new SMAAEffect());

    this.composer.addPass(new EffectPass(this.camera, ...effects));
  }

  applyQuality(level: QualityLevel): void {
    this.level = level;
    this.quality = QUALITY[level];
    saveQuality(level);

    this.renderer.shadowMap.enabled = this.quality.shadows;
    if (this.key.shadow.mapSize.x !== this.quality.shadowMapSize) {
      this.key.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.key.castShadow = this.quality.shadows;

    this.dpr = Math.min(window.devicePixelRatio, this.quality.maxPixelRatio);
    this.renderScale = 1;
    this.buildComposer();
    this.applyRenderScale();
  }

  private applyRenderScale(): void {
    this.renderer.setPixelRatio(this.dpr * this.renderScale);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateDynamicResolution(dtMs: number): void {
    this.avgMs = this.avgMs * 0.9 + dtMs * 0.1;
    if (!this.quality.dynamicResolution) return;
    // Hold ~60fps: shrink if we're slow, grow back when we have headroom.
    let next = this.renderScale;
    if (this.avgMs > 19 && this.renderScale > 0.6) next = this.renderScale - 0.05;
    else if (this.avgMs < 14 && this.renderScale < 1) next = this.renderScale + 0.05;
    if (Math.abs(next - this.renderScale) > 0.001) {
      this.renderScale = Math.max(0.6, Math.min(1, next));
      this.applyRenderScale();
    }
  }

  private handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  render(dt: number): void {
    this.perf.begin();
    const dtMs = Math.min(dt * 1000, 100);
    this.updateDynamicResolution(dtMs);
    this.renderer.info.reset();
    this.composer.render(dt);
    this.perf.end(this.renderer, dtMs);
  }
}
