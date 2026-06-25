/**
 * Asset pipeline (P1). A manifest-driven loader for glTF models and KTX2
 * textures with Draco + meshopt geometry decompression, progress reporting for
 * the loading screen, an LRU cache, and lazy (on-demand) loading for cosmetics.
 *
 * Two-layer art sourcing (see ATTRIBUTION.md): the game ships fully playable on
 * PROCEDURAL geometry/materials. This manager is the DROP-IN SLOT — register a
 * real `.glb`/`.ktx2` in the manifest and call `load()`; nothing here invents
 * art or blocks the game when the manifest is empty.
 *
 * Client-only presentation: loads meshes/textures for display. It never touches
 * movement, hit detection, currency, or match outcome (those are server-side).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AssetCategory = 'map' | 'character' | 'weapon' | 'cosmetic' | 'prop';

export interface AssetEntry {
  id: string;
  url: string;
  category: AssetCategory;
  /** Loaded up-front during the loading screen (vs. lazily, on first use). */
  preload?: boolean;
  /** Optional uniform scale applied to the loaded scene. */
  scale?: number;
}

export type AssetManifest = AssetEntry[];

export interface LoadProgress {
  loaded: number;
  total: number;
  /** 0..1; 1 when there is nothing (more) to load. */
  fraction: number;
  label: string;
}

/**
 * Where the Draco / KTX2 (Basis) decoder binaries live, relative to the site
 * root. Defaults to a local folder so the game has no hard CDN dependency.
 *
 * LIMITATION: these decoder files are NOT in the repo yet (there are no
 * compressed assets to need them). When you add a Draco/meshopt/KTX2 `.glb`,
 * drop the decoders under `client/public/decoders/{draco,basis}/` (copy from
 * `three/examples/jsm/libs/`) — see docs/assets.md.
 */
const DEFAULT_DECODER_PATH = '/decoders/';

export class AssetManager {
  private readonly gltf: GLTFLoader;
  private readonly draco: DRACOLoader;
  private readonly ktx2: KTX2Loader;
  private readonly manifest = new Map<string, AssetEntry>();

  // LRU cache of loaded scenes. Most-recently-used is at the end of the Map's
  // insertion order; we evict from the front when over capacity.
  private readonly cache = new Map<string, THREE.Group>();
  private readonly inflight = new Map<string, Promise<THREE.Group>>();
  private readonly cacheLimit: number;

  constructor(renderer: THREE.WebGLRenderer, decoderPath = DEFAULT_DECODER_PATH, cacheLimit = 32) {
    this.cacheLimit = cacheLimit;

    this.draco = new DRACOLoader();
    this.draco.setDecoderPath(`${decoderPath}draco/`);

    this.ktx2 = new KTX2Loader();
    this.ktx2.setTranscoderPath(`${decoderPath}basis/`);
    // KTX2 needs to know which GPU compressed-texture formats are supported.
    this.ktx2.detectSupport(renderer);

    this.gltf = new GLTFLoader();
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Register manifest entries (data-driven: add assets without touching code). */
  register(entries: AssetManifest): void {
    for (const e of entries) this.manifest.set(e.id, e);
  }

  /** Entries flagged for up-front loading. */
  private criticalEntries(): AssetEntry[] {
    return [...this.manifest.values()].filter((e) => e.preload);
  }

  /**
   * Load every `preload: true` asset, reporting progress for the loading
   * screen. Resolves immediately (fraction 1) when there's nothing to preload —
   * the procedural game is ready without any assets.
   */
  async preloadCritical(onProgress?: (p: LoadProgress) => void): Promise<void> {
    const entries = this.criticalEntries();
    const total = entries.length;
    if (total === 0) {
      onProgress?.({ loaded: 0, total: 0, fraction: 1, label: 'Ready' });
      return;
    }
    let loaded = 0;
    onProgress?.({ loaded, total, fraction: 0, label: 'Loading assets…' });
    for (const entry of entries) {
      await this.load(entry.id);
      loaded++;
      onProgress?.({
        loaded,
        total,
        fraction: loaded / total,
        label: `Loading ${entry.category}…`,
      });
    }
  }

  /** True if the asset is already resident (synchronous lookups won't stall). */
  has(id: string): boolean {
    return this.cache.has(id);
  }

  /** Synchronous fetch of an already-loaded asset clone, or null if not resident. */
  get(id: string): THREE.Group | null {
    const root = this.touch(id);
    return root ? (root.clone(true) as THREE.Group) : null;
  }

  /**
   * Load (or return cached) an asset by manifest id and resolve a fresh clone
   * ready to add to the scene. Concurrent calls for the same id share one fetch.
   */
  async load(id: string): Promise<THREE.Group> {
    const cached = this.touch(id);
    if (cached) return cached.clone(true) as THREE.Group;

    let pending = this.inflight.get(id);
    if (!pending) {
      const entry = this.manifest.get(id);
      if (!entry) throw new Error(`AssetManager: unknown asset id "${id}"`);
      pending = this.fetch(entry).finally(() => this.inflight.delete(id));
      this.inflight.set(id, pending);
    }
    const root = await pending;
    return root.clone(true) as THREE.Group;
  }

  /**
   * Load the FULL glTF for an id (scene + animations + skins), bypassing the
   * clone-cache. Use for rigged characters where the caller needs the
   * `AnimationClip`s (the clone-cache only keeps the scene). Reuses the same
   * configured loaders (Draco / meshopt / KTX2).
   */
  async loadGLTF(id: string): Promise<GLTF> {
    const entry = this.manifest.get(id);
    if (!entry) throw new Error(`AssetManager: unknown asset id "${id}"`);
    return this.gltf.loadAsync(entry.url);
  }

  private async fetch(entry: AssetEntry): Promise<THREE.Group> {
    const gltf: GLTF = await this.gltf.loadAsync(entry.url);
    const root = gltf.scene;
    if (entry.scale && entry.scale !== 1) root.scale.setScalar(entry.scale);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.cache.set(entry.id, root);
    this.evictIfNeeded();
    return root;
  }

  /** Mark id as most-recently-used and return its cached root (or undefined). */
  private touch(id: string): THREE.Group | undefined {
    const root = this.cache.get(id);
    if (root) {
      this.cache.delete(id);
      this.cache.set(id, root); // reinsert at the end (MRU)
    }
    return root;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const root = this.cache.get(oldest);
      this.cache.delete(oldest);
      if (root) disposeHierarchy(root);
    }
  }

  /** Free all GPU resources (geometries/textures) and decoder workers. */
  dispose(): void {
    for (const root of this.cache.values()) disposeHierarchy(root);
    this.cache.clear();
    this.draco.dispose();
    this.ktx2.dispose();
  }
}

/** Recursively dispose geometries, materials, and their textures. */
function disposeHierarchy(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(mat: THREE.Material): void {
  for (const value of Object.values(mat)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  mat.dispose();
}
