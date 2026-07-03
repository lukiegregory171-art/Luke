import * as THREE from '/vendor/three.module.js';
import { ARENA_HALF_SIZE } from './shared/mapData.js';
import { TEAM_COLOR } from './shared/constants.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 150);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a4a3a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 150;
  scene.add(sun);

  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 300);
  return camera;
}

// --- Arena geometry, built straight from the shared collider data ---

function buildRampGeometry(c) {
  const { minX, maxX, minY, maxY, minZ, maxZ, ramp } = c;
  const lowY = ramp.axis === 'z' ? (ramp.dir === 1 ? minY : maxY) : (ramp.dir === 1 ? minY : maxY);
  const highY = ramp.axis === 'z' ? (ramp.dir === 1 ? maxY : minY) : (ramp.dir === 1 ? maxY : minY);

  let lowEdgeZ = minZ;
  let highEdgeZ = maxZ;
  let lowEdgeX = minX;
  let highEdgeX = maxX;

  const positions = [];
  const addTri = (a, b, cc) => positions.push(...a, ...b, ...cc);

  if (ramp.axis === 'z') {
    lowEdgeZ = ramp.dir === 1 ? minZ : maxZ;
    highEdgeZ = ramp.dir === 1 ? maxZ : minZ;
    const lo = [minX, lowY, lowEdgeZ];
    const loR = [maxX, lowY, lowEdgeZ];
    const hi = [minX, highY, highEdgeZ];
    const hiR = [maxX, highY, highEdgeZ];
    const botLo = [minX, minY, lowEdgeZ];
    const botLoR = [maxX, minY, lowEdgeZ];
    const botHi = [minX, minY, highEdgeZ];
    const botHiR = [maxX, minY, highEdgeZ];

    // sloped top
    addTri(lo, loR, hiR); addTri(lo, hiR, hi);
    // bottom
    addTri(botLo, botHiR, botLoR); addTri(botLo, botHi, botHiR);
    // low-side vertical face
    addTri(lo, loR, botLoR); addTri(lo, botLoR, botLo);
    // left triangular face (x = minX)
    addTri(lo, hi, botHi); addTri(lo, botHi, botLo);
    // right triangular face (x = maxX)
    addTri(loR, botHiR, hiR); addTri(loR, botLoR, botHiR);
  } else {
    lowEdgeX = ramp.dir === 1 ? minX : maxX;
    highEdgeX = ramp.dir === 1 ? maxX : minX;
    const lo = [lowEdgeX, lowY, minZ];
    const loR = [lowEdgeX, lowY, maxZ];
    const hi = [highEdgeX, highY, minZ];
    const hiR = [highEdgeX, highY, maxZ];
    const botLo = [lowEdgeX, minY, minZ];
    const botLoR = [lowEdgeX, minY, maxZ];
    const botHi = [highEdgeX, minY, minZ];
    const botHiR = [highEdgeX, minY, maxZ];

    addTri(lo, hiR, loR); addTri(lo, hi, hiR);
    addTri(botLo, botLoR, botHiR); addTri(botLo, botHiR, botHi);
    addTri(lo, botLoR, loR); addTri(lo, botLo, botLoR);
    addTri(lo, loR, botHiR); addTri(lo, botHiR, botHi);
    addTri(hi, hiR, botHiR); addTri(hi, botHiR, botHi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildArenaMeshes(scene, colliders) {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2.4, ARENA_HALF_SIZE * 2.4),
    new THREE.MeshLambertMaterial({ color: 0x3a4a3a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  for (const c of colliders) {
    if (c.type === 'ground') continue;
    let mesh;
    if (c.type === 'ramp') {
      const geo = buildRampGeometry(c);
      mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c.color }));
    } else {
      const sx = c.maxX - c.minX;
      const sy = c.maxY - c.minY;
      const sz = c.maxZ - c.minZ;
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshLambertMaterial({ color: c.color }),
      );
      mesh.position.set((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  scene.add(group);
  return group;
}

// --- Blocky, Roblox-proportioned character ---

export function createCharacterMesh(team) {
  const bodyColor = TEAM_COLOR[team] ?? 0xffffff;
  const headColor = 0xf2c879;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const headMat = new THREE.MeshLambertMaterial({ color: headColor });

  const group = new THREE.Group();

  const legW = 0.34, legH = 0.68, legD = 0.34;
  const torsoW = 0.68, torsoH = 0.68, torsoD = 0.36;
  const armW = 0.28, armH = 0.68, armD = 0.28;
  const headS = 0.48;

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), bodyMat);
  leftLeg.position.set(-0.19, legH / 2, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.19;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), bodyMat);
  torso.position.set(0, legH + torsoH / 2, 0);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), bodyMat);
  leftArm.position.set(-(torsoW / 2 + armW / 2), torso.position.y, 0);
  const rightArm = leftArm.clone();
  rightArm.position.x = torsoW / 2 + armW / 2;

  const head = new THREE.Mesh(new THREE.BoxGeometry(headS, headS, headS), headMat);
  head.position.set(0, torso.position.y + torsoH / 2 + headS / 2, 0);

  const handMount = new THREE.Object3D();
  handMount.position.set(0, -armH / 2 + 0.08, armD / 2 + 0.32);
  rightArm.add(handMount);

  for (const part of [leftLeg, rightLeg, torso, leftArm, rightArm, head]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }

  group.add(leftLeg, rightLeg, torso, leftArm, rightArm, head);
  group.userData = { leftLeg, rightLeg, torso, leftArm, rightArm, head, handMount, team };
  return group;
}

export function makeNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 8, 256, 40);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text.slice(0, 16), 128, 38);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(0, 2.35, 0);
  sprite.renderOrder = 10;
  return sprite;
}
