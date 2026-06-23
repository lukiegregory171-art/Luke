/**
 * Three.js scene + the BRIGHT ARCADE pipeline (ARTBIBLE.md). Geometry is still
 * derived from the SAME shared `GameMap` the server uses for collision /
 * occlusion — what you see is what you collide with. NONE of this touches
 * authority.
 *
 * Look (Krunker-tier): chunky low-poly flat-shaded geometry in bold SOLID
 * colours under a bright, even daytime rig — a gradient sky dome, a strong
 * hemisphere fill, and one warm directional "sun" with soft PCF shadows. Minimal
 * post-processing: just light anti-aliasing (MSAA) and a correct sRGB output —
 * NO bloom, NO vignette, NO scanlines, NO heavy tone mapping — so colours stay
 * bright, crisp and high-contrast. Quality presets + dynamic resolution hold the
 * frame rate; a perf HUD reports the cost.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { AABB, GameMap } from '@liquidate/shared';
import {
  QUALITY,
  initialQuality,
  saveQuality,
  type QualityLevel,
  type QualitySettings,
} from './quality';
import { buildDressing, buildProps, envTheme, type EnvTheme } from './env';
import type { AssetManager } from './assets';
import { COLORS, matte, solid } from './palette';
import { makeGridTexture, makeTickerTexture } from './textures';
import type { PerfHud } from './perf';

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private composer!: EffectComposer;
  private readonly arena = new THREE.Group();
  // Real CC0 environment props (clouds/grass/flags). Clones SHARE cached
  // geometry, so this group is cleared WITHOUT disposing on a map change.
  private readonly propsGroup = new THREE.Group();
  private assets?: AssetManager;
  private readonly sun: THREE.DirectionalLight;

  // Rotating low-poly centre prop (solid gold diamond + brand ring). Decorative.
  private readonly core = new THREE.Group();
  private readonly coreOcta: THREE.Mesh;
  private readonly coreRing: THREE.Mesh;

  private quality: QualitySettings;
  private level: QualityLevel;
  private renderScale = 1;
  private avgMs = 7;
  private dpr = Math.min(window.devicePixelRatio, 2);

  // Skin accent (P4): crate edges + dressing trim retint to this. Cosmetic only.
  private accent: number = COLORS.green;
  private accentMats: THREE.Material[] = [];
  // Shared cover materials (reused by the platform fallback path).
  private crateMat?: THREE.Material;
  private edgeMat?: THREE.LineBasicMaterial;

  constructor(
    private readonly container: HTMLElement,
    private readonly perf: PerfHud,
  ) {
    this.scene.background = new THREE.Color(COLORS.horizon);
    this.scene.fog = new THREE.Fog(COLORS.horizon, 40, 160);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = 'YXZ'; // yaw (Y) then pitch (X) => matches shared aimDirection

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Bright + saturated: no heavy tone mapping, correct sRGB output.
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // reset once/frame so draw-call stats cover all passes
    this.container.appendChild(this.renderer.domElement);

    // --- Bright, even light rig --------------------------------------------
    const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 0.9);

    this.sun = new THREE.DirectionalLight(COLORS.sun, 1.1);
    this.sun.position.set(18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;

    this.scene.add(hemi, this.sun, this.sun.target);

    // Gradient daytime sky dome (one cheap draw call; persists across maps).
    this.scene.add(this.makeSkyDome());

    // --- Centre prop: a slowly rotating solid diamond + brand ring ----------
    this.coreOcta = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), solid(COLORS.gold, 0.35));
    this.coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 32), solid(COLORS.green, 0.3));
    this.coreRing.rotation.x = Math.PI / 2;
    this.core.add(this.coreOcta, this.coreRing);
    this.core.position.set(0, 6, 0);
    this.scene.add(this.core);

    this.scene.add(this.arena);
    this.scene.add(this.propsGroup);

    this.level = initialQuality();
    this.quality = QUALITY[this.level];
    this.buildComposer();
    this.applyQuality(this.level);

    window.addEventListener('resize', this.handleResize);
  }

  /** A big inverted sphere with a vertical sky→horizon gradient shader. */
  private makeSkyDome(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(COLORS.sky) },
        bottomColor: { value: new THREE.Color(COLORS.horizon) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main() {
          float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.15, 0.75, h)), 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), mat);
    dome.frustumCulled = false;
    dome.renderOrder = -1; // draw the sky first, behind everything
    return dome;
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

  /** Provide the asset manager so maps can be dressed with real CC0 props. */
  setAssets(assets: AssetManager): void {
    this.assets = assets;
  }

  /** Build (or rebuild) the arena geometry + environment dressing for a map. */
  setMap(map: GameMap): void {
    this.arena.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.arena.clear();
    // Prop clones share cached geometry/materials — clear WITHOUT disposing those,
    // but free each InstancedMesh's per-instance buffer.
    this.propsGroup.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
    });
    this.propsGroup.clear();

    const theme = envTheme(map);
    const far = Math.max(120, Math.max(map.width, map.depth) * 2.4);
    this.scene.fog = new THREE.Fog(theme.fog, 40, far);

    this.buildArena(map, theme); // resets accentMats with the crate edges
    const { group, accentMats } = buildDressing(map, theme);
    this.arena.add(group);
    this.accentMats.push(...accentMats);

    // Real CC0 prop layer (clouds/grass/flags), if the assets are resident.
    if (this.assets) {
      const get = (id: string): THREE.Object3D | null => this.assets!.get(`env-${id}`);
      this.propsGroup.add(buildProps(map, get));
    }
    // Raised catwalks: real platform models (or a procedural block fallback).
    this.dressPlatforms(map);
    this.setAccent(this.accent); // retint accents to the active skin

    this.core.position.set(0, map.wallHeight + 1.8, 0);
    this.fitShadowCamera(map);
  }

  /** Fit the shadow camera tightly to the arena for crisp soft shadows. */
  private fitShadowCamera(map: GameMap): void {
    const r = Math.max(map.width, map.depth) * 0.62;
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, 0);
  }

  private buildArena(map: GameMap, theme: EnvTheme): void {
    this.accentMats = [];

    // Floor: light matte plane with a subtle clean grid (albedo, not glow). The
    // grid texture carries the floor tint, so the material base is white (an
    // albedo map multiplies the colour — tinting both would darken the floor).
    const grid = makeGridTexture(theme.grid, theme.floor);
    grid.repeat.set(map.width / 2, map.depth / 2);
    const floorMat = matte(0xffffff, { map: grid });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arena.add(floor);

    // Perimeter walls (light matte) + a couple of clean ticker signs.
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

    // Cover crates: solid bright accent-coloured block + a coloured edge that
    // retints to the active skin (gives the clean "outlined block" arcade pop).
    // RAISED platforms (min.y > 0) are skipped here and dressed with real CC0
    // platform models in dressPlatforms() (procedural block as the fallback).
    this.crateMat = solid(theme.obstacle, 0.15);
    this.edgeMat = new THREE.LineBasicMaterial({ color: this.accent });
    this.accentMats.push(this.edgeMat);
    for (const box of map.obstacles) {
      if (box.min.y > 0.01) continue; // raised catwalk → dressed separately
      this.addCrate(box);
    }
  }

  /** Render one ground-cover crate (solid block + outlined edges) into the arena. */
  private addCrate(box: AABB): void {
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mesh = new THREE.Mesh(geo, this.crateMat!);
    mesh.position.set(
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.arena.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat!);
    edges.position.copy(mesh.position);
    this.arena.add(edges);
  }

  /**
   * Dress RAISED platforms (floating obstacles, min.y > 0) with a real CC0
   * square-slab model scaled to the obstacle's footprint, its walkable top
   * aligned to the collidable top (so "what you see is what you collide with").
   * Clones share cached geometry → they go in propsGroup (cleared, not disposed).
   * Falls back to a procedural block if the model isn't resident.
   */
  private dressPlatforms(map: GameMap): void {
    const nb = new THREE.Box3();
    const ns = new THREE.Vector3();
    const nc = new THREE.Vector3();
    for (const box of map.obstacles) {
      if (box.min.y <= 0.01) continue; // ground cover handled by buildArena
      const glb = this.assets?.get('env-platform') ?? null;
      if (!glb) {
        this.addCrate(box); // procedural fallback (into the arena)
        continue;
      }
      const sx = box.max.x - box.min.x;
      const sz = box.max.z - box.min.z;
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      nb.setFromObject(glb);
      nb.getSize(ns);
      nb.getCenter(nc);
      const fx = sx / (ns.x || 1);
      const fz = sz / (ns.z || 1);
      glb.scale.set(fx, 1, fz);
      // Align the model's top to the collidable top; centre it on the footprint.
      glb.position.set(cx - nc.x * fx, box.max.y - nb.max.y, cz - nc.z * fz);
      glb.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      this.propsGroup.add(glb);
    }
  }

  /** Clean candlestick "ticker" signs on the long walls (crypto identity). */
  private addTickerPanels(map: GameMap): void {
    const tex = makeTickerTexture();
    const panelMat = new THREE.MeshBasicMaterial({ map: tex });
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
   * Retint the crate edges + dressing trim to a skin accent (P4). Cosmetic only:
   * touches material colours, never geometry or anything the server collides
   * against. Skins are client-local and never sent to the server.
   */
  setAccent(hex: number): void {
    this.accent = hex;
    for (const m of this.accentMats) {
      const mm = m as THREE.MeshStandardMaterial & THREE.LineBasicMaterial;
      mm.color?.setHex(hex);
      mm.emissive?.setHex(hex); // present on the solid trim/pylon materials
    }
  }

  // --- Post-processing + quality --------------------------------------------

  private buildComposer(): void {
    this.composer?.dispose();
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(db.x, db.y, {
      type: THREE.HalfFloatType,
      samples: this.quality.smaa ? 4 : 0, // MSAA on capable presets (light AA)
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // OutputPass applies the (no-op) tone mapping + sRGB conversion. That's the
    // entire post chain — crisp and bright, no bloom/vignette/grain.
    this.composer.addPass(new OutputPass());
  }

  applyQuality(level: QualityLevel): void {
    this.level = level;
    this.quality = QUALITY[level];
    saveQuality(level);

    this.renderer.shadowMap.enabled = this.quality.shadows;
    if (this.sun.shadow.mapSize.x !== this.quality.shadowMapSize) {
      this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = this.quality.shadows;

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

  /** Compile shaders + prime the render chain behind the loading screen (P1). */
  async warmup(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.info.reset();
    this.composer.render(0.016);
  }

  render(dt: number): void {
    this.perf.begin();
    const dtMs = Math.min(dt * 1000, 100);
    this.updateDynamicResolution(dtMs);
    // Spin the centre prop (cosmetic).
    this.coreOcta.rotation.y += dt * 0.6;
    this.coreOcta.rotation.x += dt * 0.25;
    this.coreRing.rotation.z += dt * 0.4;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.perf.end(this.renderer, dtMs);
  }
}
