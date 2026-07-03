// Single source of truth for the arena. Both the server (collision + hit detection)
// and the client (rendering + local prediction) build from this same data so the
// world looks exactly like what you can and can't walk through.

export const ARENA_HALF_SIZE = 46;

// Helper to author one quadrant and mirror it across both axes for a perfectly
// symmetrical map (fairness between the red and blue sides).
function box(minX, maxX, minY, maxY, minZ, maxZ, type, color) {
  return { minX, maxX, minY, maxY, minZ, maxZ, type, color, ramp: null };
}

function ramp(minX, maxX, minY, maxY, minZ, maxZ, axis, dir, color) {
  return { minX, maxX, minY, maxY, minZ, maxZ, type: 'ramp', color, ramp: { axis, dir } };
}

function mirrorX(c) {
  return { ...c, minX: -c.maxX, maxX: -c.minX };
}
function mirrorZ(c) {
  const out = { ...c, minZ: -c.maxZ, maxZ: -c.minZ };
  if (c.ramp) out.ramp = { axis: c.ramp.axis, dir: c.ramp.axis === 'z' ? -c.ramp.dir : c.ramp.dir };
  return out;
}

export function buildArenaColliders() {
  const colliders = [];

  // Flat ground plane (fallback surface height 0 everywhere).
  colliders.push(box(-ARENA_HALF_SIZE, ARENA_HALF_SIZE, -2, 0, -ARENA_HALF_SIZE, ARENA_HALF_SIZE, 'ground', 0x3a4a3a));

  // Perimeter walls so nobody can wander off the arena.
  const wallH = 12;
  colliders.push(box(-ARENA_HALF_SIZE, ARENA_HALF_SIZE, 0, wallH, ARENA_HALF_SIZE - 1, ARENA_HALF_SIZE + 2, 'boundary', 0x2b2f36));
  colliders.push(box(-ARENA_HALF_SIZE, ARENA_HALF_SIZE, 0, wallH, -ARENA_HALF_SIZE - 2, -ARENA_HALF_SIZE + 1, 'boundary', 0x2b2f36));
  colliders.push(box(ARENA_HALF_SIZE - 1, ARENA_HALF_SIZE + 2, 0, wallH, -ARENA_HALF_SIZE, ARENA_HALF_SIZE, 'boundary', 0x2b2f36));
  colliders.push(box(-ARENA_HALF_SIZE - 2, -ARENA_HALF_SIZE + 1, 0, wallH, -ARENA_HALF_SIZE, ARENA_HALF_SIZE, 'boundary', 0x2b2f36));

  // --- Central tower: solid pillar + overhanging rooftop plaza reached by two ramps ---
  colliders.push(box(-3, 3, 0, 8, -3, 3, 'tower', 0x8a8f99));
  colliders.push(box(-5.5, 5.5, 8, 8.7, -5.5, 5.5, 'tower', 0x9aa0ab));
  // Ramp up the red-facing side (-z) and mirrored blue-facing side (+z).
  const towerRampRed = ramp(-2, 2, 0, 8, -10, -3, 'z', 1, 0x6d7480);
  colliders.push(towerRampRed);
  colliders.push(mirrorZ(towerRampRed));

  // --- Side lane dividers (low walls separating mid-lane from the flanks) ---
  const laneWallH = 2.2;
  const laneWallRed = box(-31, -29, 0, laneWallH, -38, -4, 'wall', 0x4a4f57);
  colliders.push(laneWallRed);
  colliders.push(mirrorZ(laneWallRed));
  colliders.push(mirrorX(laneWallRed));
  colliders.push(mirrorX(mirrorZ(laneWallRed)));

  // --- Cover crates, authored in one quadrant and mirrored to all four ---
  const crateSpecs = [
    { x: 10, z: 16, s: 2.4 },
    { x: 17, z: 8, s: 2.0 },
    { x: 6, z: 24, s: 2.2 },
    { x: 22, z: 22, s: 2.6 },
  ];
  for (const c of crateSpecs) {
    const h = c.s;
    const base = box(c.x - c.s / 2, c.x + c.s / 2, 0, h, c.z - c.s / 2, c.z + c.s / 2, 'crate', 0x8a6d3b);
    colliders.push(base);
    colliders.push(mirrorX(base));
    colliders.push(mirrorZ(base));
    colliders.push(mirrorX(mirrorZ(base)));
  }

  // --- Ramps up onto a pair of mid-field bunkers (one per side, mirrored) ---
  const bunkerRed = box(-15, -9, 0, 3.2, -22, -16, 'crate', 0x8a6d3b);
  colliders.push(bunkerRed);
  colliders.push(mirrorZ(bunkerRed));
  colliders.push(mirrorX(bunkerRed));
  colliders.push(mirrorX(mirrorZ(bunkerRed)));

  const bunkerRampRed = ramp(-14, -10, 0, 3.2, -27, -22, 'z', 1, 0x6d7480);
  colliders.push(bunkerRampRed);
  colliders.push(mirrorZ(bunkerRampRed));
  colliders.push(mirrorX(bunkerRampRed));
  colliders.push(mirrorX(mirrorZ(bunkerRampRed)));

  return colliders;
}

export const SPAWN_POINTS = {
  red: [
    { x: -8, y: 0.1, z: -40, yaw: 0 },
    { x: 0, y: 0.1, z: -40, yaw: 0 },
    { x: 8, y: 0.1, z: -40, yaw: 0 },
    { x: -16, y: 0.1, z: -36, yaw: 0 },
    { x: 16, y: 0.1, z: -36, yaw: 0 },
  ],
  blue: [
    { x: -8, y: 0.1, z: 40, yaw: Math.PI },
    { x: 0, y: 0.1, z: 40, yaw: Math.PI },
    { x: 8, y: 0.1, z: 40, yaw: Math.PI },
    { x: -16, y: 0.1, z: 36, yaw: Math.PI },
    { x: 16, y: 0.1, z: 36, yaw: Math.PI },
  ],
};

export function randomSpawn(team) {
  const pts = SPAWN_POINTS[team];
  return pts[Math.floor(Math.random() * pts.length)];
}
