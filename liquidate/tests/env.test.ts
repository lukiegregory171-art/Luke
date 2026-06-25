/**
 * P5 environment art. Two things matter here: every map has a mood (theme), and
 * the decorative dressing never becomes FAKE COVER. The arena is dressed up
 * (upper walls, ceiling, trim, pylons, floor markings) but collision is still
 * only `map.obstacles` — so this test asserts no tall decoration is planted in
 * the interior at player height. If someone adds a decorative "crate" you could
 * try to hide behind but can't, this fails.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MAP_LIST, VAULT } from '@liquidate/shared';
import { DEFAULT_ENV, ENV_THEMES, buildDressing, buildProps, envTheme } from '../client/src/env';

describe('environment themes (P5)', () => {
  it('every map resolves to a theme', () => {
    for (const map of MAP_LIST) {
      const theme = envTheme(map);
      expect(theme).toBeDefined();
      expect(typeof theme.fog).toBe('number');
      expect(typeof theme.floor).toBe('number');
    }
    // Explicit themes exist for the shipped maps.
    expect(Object.keys(ENV_THEMES)).toEqual(expect.arrayContaining(MAP_LIST.map((m) => m.id)));
  });

  it('falls back to the default theme for an unknown map', () => {
    const fake = { ...VAULT, id: 'does-not-exist' };
    expect(envTheme(fake)).toBe(DEFAULT_ENV);
  });
});

describe('arena dressing is decoration, never cover (P5)', () => {
  it('plants no tall decoration in the interior at player height', () => {
    const map = VAULT;
    const theme = envTheme(map);
    const { group } = buildDressing(map, theme);

    const halfW = map.width / 2;
    const halfD = map.depth / 2;
    const interiorMargin = 1.0; // metres in from the walls counts as "play space"

    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const y = mesh.position.y;
      // Only worry about things whose centre sits in the cover band (a flat
      // floor decal at y~0 can't be cover; anything above the wall can't be).
      if (y <= 0.2 || y >= map.wallHeight) return;
      const interior =
        Math.abs(mesh.position.x) < halfW - interiorMargin &&
        Math.abs(mesh.position.z) < halfD - interiorMargin;
      expect(interior).toBe(false); // any waist-height decor must be at the perimeter
    });
  });

  it('returns accent materials for the skin system to retint', () => {
    const { accentMats } = buildDressing(VAULT, envTheme(VAULT));
    expect(accentMats.length).toBeGreaterThan(0);
  });
});

describe('real env props (CC0 Kenney) are decoration, never cover', () => {
  // Stub provider: a 1×1×1 box stands in for each loaded prop clone.
  const get = (): THREE.Object3D =>
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());

  it('places clouds/grass/flags only above the wall or at the perimeter', () => {
    const map = VAULT;
    const group = buildProps(map, get);
    expect(group.children.length).toBeGreaterThan(0); // instanced prop meshes

    const halfW = map.width / 2;
    const halfD = map.depth / 2;
    const margin = 1.0;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (const obj of group.children) {
      const inst = obj as THREE.InstancedMesh;
      expect(inst.isInstancedMesh).toBe(true);
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        m.decompose(pos, quat, scl);
        if (pos.y <= 0.2 || pos.y >= map.wallHeight) continue; // sky/floor can't be cover
        const interior = Math.abs(pos.x) < halfW - margin && Math.abs(pos.z) < halfD - margin;
        expect(interior).toBe(false);
      }
    }
  });

  it('skips gracefully when a prop is not resident', () => {
    const group = buildProps(VAULT, () => null);
    expect(group.children.length).toBe(0);
  });
});
