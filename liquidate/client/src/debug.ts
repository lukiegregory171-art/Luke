/**
 * TEMP bot debug aids (remove once the invisible-bot issue is confirmed fixed).
 * A bright, always-on-top marker box placed at a bot's AUTHORITATIVE position —
 * independent of the avatar, so it reveals the truth: if the marker shows where
 * a bot should stand but you see no character, it's an avatar render/attach bug;
 * if the marker is sunk in the floor or off-map, it's a position bug.
 */

import * as THREE from 'three';

export const DEBUG_BOTS = true; // flip to false (or delete this module's uses) to remove

/** A 1.5 m magenta box that always draws on top (depthTest off). */
export function makeBotMarker(): THREE.Mesh {
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.8, 1.2),
    new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
    }),
  );
  marker.renderOrder = 999;
  marker.frustumCulled = false;
  marker.visible = false;
  return marker;
}
