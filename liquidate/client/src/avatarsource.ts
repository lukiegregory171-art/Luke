/**
 * Holds the loaded rigged-avatar source (skinned scene + animation clips) once,
 * so every {@link RiggedCharacter} can clone from it without reloading. Set at
 * boot after the AssetManager loads the character glTF; until then (or if the
 * load fails) avatars fall back to the procedural figure. Client-only display.
 */

import type * as THREE from 'three';

export interface AvatarSource {
  scene: THREE.Object3D; // skinned template — clone per instance (SkeletonUtils)
  clips: THREE.AnimationClip[];
}

let source: AvatarSource | null = null;

export function setAvatarSource(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  source = { scene, clips };
}

export function getAvatarSource(): AvatarSource | null {
  return source;
}

export function hasAvatarSource(): boolean {
  return source !== null;
}
