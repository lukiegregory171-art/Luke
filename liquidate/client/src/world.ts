/**
 * Three.js scene + the LOCKED stylized pipeline (M2, ARTBIBLE.md). Geometry is
 * still derived from the SAME shared `GameMap` the server uses for collision /
 * occlusion — what you see is what you collide with. NONE of this touches
 * authority.
 *
 * Look (locked): low-poly flat-shaded matte + emissive-neon materials on the
 * locked palette, a dark desaturated arena so players/neon POP, a hemisphere +
 * warm key (PCF soft shadows) + cyan/magenta point rims + a warm hero light at a
 * rotating emissive "arena core" rig, ACESFilmic tone mapping @1.05, FOV 80, and
 * the SIGNATURE bloom chain: RenderPass → UnrealBloomPass(0.9/0.55/0.85) →
 * OutputPass (threshold ~0.85 so only emissives bloom). Quality presets + dynamic
 * resolution hold the frame rate; a perf HUD reports the cost.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GameMap } from '@liquidate/shared';
import {
  QUALITY,
  initialQuality,
  saveQuality,
  type QualityLevel,
  type QualitySettings,
} from './quality';
import { buildDressing, envTheme, type EnvTheme } from './env';
import { COLORS, matte, neon } from './palette';
import { makeGridTexture, makeTickerTexture } from './textures';
import type { PerfHud } from './perf';

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private readonly arena = new THREE.Group();
  private readonly key: THREE.DirectionalLight;

  // Rotating emissive "arena core" (octahedron + torus halo + hero light).
  private readonly core = new THREE.Group();
  private readonly coreOcta: THREE.Mesh;
  private readonly coreHalo: THREE.Mesh;

  private quality: QualitySettings;
  private level: QualityLevel;
  private renderScale = 1;
  private avgMs = 7;
  private dpr = Math.min(window.devicePixelRatio, 2);

  // Skin accent (P4): crate neon + dressing trim retint to this. Cosmetic only.
  private accent: number = COLORS.green;
  private accentMats: THREE.Material[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly perf: PerfHud,
  ) {
    this.scene.background = new THREE.Color(COLORS.env);
    this.scene.fog = new THREE.Fog(COLORS.env, 18, 60);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.rotation.order = 'YXZ'; // yaw (Y) then pitch (X) => matches shared aimDirection

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // reset once/frame so draw-call stats cover all passes
    this.container.appendChild(this.renderer.domElement);

    // --- Locked light rig ---------------------------------------------------
    const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.55);

    this.key = new THREE.DirectionalLight(COLORS.keyLight, 1.15);
    this.key.position.set(14, 26, 10);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.04;

    const cyanRim = new THREE.PointLight(COLORS.cyan, 60, 60, 2);
    cyanRim.position.set(-14, 8, -12);
    const magentaRim = new THREE.PointLight(COLORS.magenta, 60, 60, 2);
    magentaRim.position.set(14, 8, 12);

    this.scene.add(hemi, this.key, this.key.target, cyanRim, magentaRim);

    // --- Arena core: rotating emissive centerpiece + warm hero light --------
    this.coreOcta = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), neon(COLORS.gold, 2.5));
    this.coreHalo = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.07, 10, 40), neon(COLORS.cyan, 2.4));
    this.coreHalo.rotation.x = Math.PI / 2;
    const hero = new THREE.PointLight(COLORS.keyLight, 40, 50, 2);
    this.core.add(this.coreOcta, this.coreHalo, hero);
    this.core.position.set(0, 6, 0);
    this.scene.add(this.core);

    this.scene.add(this.arena);

    this.level = initialQuality();
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

  /** Set the camera field of view (degrees). Cosmetic — aim is yaw/pitch. */
  setFov(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  /** Build (or rebuild) the arena geometry + environment dressing for a map. */
  setMap(map: GameMap): void {
    this.arena.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.arena.clear();

    const theme = envTheme(map);
    const far = Math.max(60, Math.max(map.width, map.depth) * 1.7);
    this.scene.fog = new THREE.Fog(theme.fog, 18, far);
    this.scene.background = new THREE.Color(theme.fog);

    this.buildArena(map, theme); // resets accentMats with the crate neon
    const { group, accentMats } = buildDressing(map, theme);
    this.arena.add(group);
    this.accentMats.push(...accentMats);
    this.setAccent(this.accent); // retint neon to the active skin

    this.core.position.set(0, map.wallHeight + 1.8, 0);
    this.fitShadowCamera(map);
  }

  /** Fit the shadow camera tightly to the arena for crisp soft shadows. */
  private fitShadowCamera(map: GameMap): void {
    const r = Math.max(map.width, map.depth) * 0.62;
    const cam = this.key.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 80;
    cam.updateProjectionMatrix();
    this.key.target.position.set(0, 0, 0);
  }

  private buildArena(map: GameMap, theme: EnvTheme): void {
    this.accentMats = [];

    // Floor: matte dark plane with an emissive glowing grid (canvas map).
    const grid = makeGridTexture(COLORS.cyan);
    grid.repeat.set(map.width / 2, map.depth / 2);
    const floorMat = matte(theme.floor, {
      emissive: 0xffffff,
      emissiveMap: grid,
      emissiveIntensity: 1.3,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arena.add(floor);

    // Perimeter walls (matte) + a few emissive ticker panels (crypto signage).
    const halfW = map.width / 2;
    const halfD = map.depth / 2;
    const h = map.wallHeight;
    const t = 0.4;
    const wallMat = matte(theme.wall);
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
    this.addTickerPanels(map);

    // Cover crates: matte box + bright neon edge accent that blooms (retintable).
    const crateMat = matte(theme.obstacle);
    const edgeMat = new THREE.LineBasicMaterial({ color: this.accent });
    this.accentMats.push(edgeMat);
    for (const box of map.obstacles) {
      const sx = box.max.x - box.min.x;
      const sy = box.max.y - box.min.y;
      const sz = box.max.z - box.min.z;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geo, crateMat);
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

  /** Emissive candlestick "ticker" panels on the long walls (crypto identity). */
  private addTickerPanels(map: GameMap): void {
    const tex = makeTickerTexture();
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.5,
    });
    const halfD = map.depth / 2;
    const y = Math.min(2.4, map.wallHeight - 0.6);
    const pw = Math.min(8, map.width * 0.5);
    for (const sign of [-1, 1] as const) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 4), panelMat);
      panel.position.set(0, y, sign * (halfD - 0.25));
      panel.rotation.y = sign < 0 ? 0 : Math.PI;
      this.arena.add(panel);
    }
  }

  /**
   * Retint the crate neon + dressing trim to a skin accent (P4). Cosmetic only:
   * touches material colours, never geometry or anything the server collides
   * against. Skins are client-local and never sent to the server.
   */
  setAccent(hex: number): void {
    this.accent = hex;
    for (const m of this.accentMats) {
      const mm = m as THREE.MeshStandardMaterial & THREE.LineBasicMaterial;
      mm.color?.setHex(hex);
      mm.emissive?.setHex(hex); // present on the trim/pylon MeshStandardMaterials
    }
  }

  // --- Post-processing + quality --------------------------------------------

  private buildComposer(): void {
    this.composer?.dispose();
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(db.x, db.y, {
      type: THREE.HalfFloatType,
      samples: this.quality.smaa ? 4 : 0, // MSAA on capable presets
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // THE SIGNATURE: only emissives cross the 0.85 threshold and bloom.
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9, // strength
      0.55, // radius
      0.85, // threshold
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass()); // ACES tone map + sRGB, final
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
    // Defend the frame rate: shrink if slow, grow back when there's headroom.
    let next = this.renderScale;
    if (this.avgMs > 11 && this.renderScale > 0.6) next = this.renderScale - 0.05;
    else if (this.avgMs < 8 && this.renderScale < 1) next = this.renderScale + 0.05;
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

  /** Compile shaders + prime the bloom chain behind the loading screen (P1). */
  async warmup(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.info.reset();
    this.composer.render(0.016);
  }

  render(dt: number): void {
    this.perf.begin();
    const dtMs = Math.min(dt * 1000, 100);
    this.updateDynamicResolution(dtMs);
    // Spin the arena core (cosmetic).
    this.coreOcta.rotation.y += dt * 0.6;
    this.coreOcta.rotation.x += dt * 0.25;
    this.coreHalo.rotation.z += dt * 0.4;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.perf.end(this.renderer, dtMs);
  }
}
