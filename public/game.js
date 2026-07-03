import * as THREE from '/vendor/three.module.js';
import {
  createRenderer, createScene, createCamera, buildArenaMeshes, createCharacterMesh, makeNameTag,
} from './modules/renderer.js';
import { createWeaponModel } from './modules/weaponModels.js';
import { EffectsManager } from './modules/effects.js';
import { InputManager } from './modules/input.js';
import { NetworkClient } from './modules/network.js';
import { LocalPlayer } from './modules/localPlayer.js';
import { RemotePlayer } from './modules/remotePlayer.js';
import { Hud } from './modules/hud.js';
import { buildArenaColliders } from './modules/shared/mapData.js';
import { WEAPONS } from './modules/shared/weapons.js';
import { MSG, TICK_RATE, PLAYER_EYE_HEIGHT, DASH_COOLDOWN, MATCH_RESTART_DELAY } from './modules/shared/constants.js';

const canvas = document.getElementById('game-canvas');
const menuOverlay = document.getElementById('menu-overlay');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');

const colliders = buildArenaColliders();
const scene = createScene();
const camera = createCamera();
scene.add(camera);
const renderer = createRenderer(canvas);
buildArenaMeshes(scene, colliders);

const effects = new EffectsManager(scene);
const hud = new Hud();
const inputManager = new InputManager(canvas);

let myId = null;
let myTeam = null;
let myName = null;
let localPlayer = null;
let joined = false;
let latestScore = { red: 0, blue: 0 };
let latestPlayers = [];
let lastKillerName = null;
let wasAlive = true;
let matchOverActive = false;
let matchOverWinner = null;
let matchOverAt = 0;

const remotePlayers = new Map(); // id -> { remote, group, weaponGroup, muzzle, weaponId, animPhase }

let currentWeaponId = 'ar';
let localFireCooldown = 0;
let prevFiringHeld = false;
let viewmodel = null;
let viewmodelMuzzle = null;

function setViewmodel(weaponId) {
  if (viewmodel) camera.remove(viewmodel);
  const { group, muzzle } = createWeaponModel(weaponId);
  group.rotation.y = Math.PI;
  group.position.set(0.26, -0.24, -0.42);
  group.scale.set(0.9, 0.9, 0.9);
  camera.add(group);
  viewmodel = group;
  viewmodelMuzzle = muzzle;
}

function getOrCreateRemote(entry) {
  let rec = remotePlayers.get(entry.id);
  if (!rec) {
    const group = createCharacterMesh(entry.team);
    const nameSprite = makeNameTag(entry.name);
    group.add(nameSprite);
    const { group: weaponGroup, muzzle } = createWeaponModel(entry.weapon);
    group.userData.handMount.add(weaponGroup);
    scene.add(group);
    rec = {
      remote: new RemotePlayer(entry), group, weaponGroup, muzzle, weaponId: entry.weapon, animPhase: 0,
    };
    remotePlayers.set(entry.id, rec);
  } else {
    rec.remote.pushState(entry);
    if (rec.weaponId !== entry.weapon) {
      rec.group.userData.handMount.remove(rec.weaponGroup);
      const { group: weaponGroup, muzzle } = createWeaponModel(entry.weapon);
      rec.group.userData.handMount.add(weaponGroup);
      rec.weaponGroup = weaponGroup;
      rec.muzzle = muzzle;
      rec.weaponId = entry.weapon;
    }
  }
  return rec;
}

function removeRemote(id) {
  const rec = remotePlayers.get(id);
  if (!rec) return;
  scene.remove(rec.group);
  remotePlayers.delete(id);
}

function startGame(welcome) {
  myId = welcome.id;
  myTeam = welcome.team;
  const selfEntry = welcome.players.find((p) => p.id === myId);
  localPlayer = new LocalPlayer({ x: selfEntry.x, y: selfEntry.y, z: selfEntry.z, yaw: selfEntry.yaw }, colliders);

  for (const entry of welcome.players) {
    if (entry.id === myId) continue;
    getOrCreateRemote(entry);
  }

  setViewmodel(currentWeaponId);
  latestScore = welcome.score;
  hud.updateScore(latestScore);
  joined = true;
  menuOverlay.style.display = 'none';
}

const network = new NetworkClient(`ws://${location.host}`);

network.on('welcome', startGame);

network.on('player_leave', (msg) => removeRemote(msg.id));

network.on('snapshot', (msg) => {
  latestPlayers = msg.players;
  latestScore = msg.score;
  hud.updateScore(latestScore);

  const seenIds = new Set();
  let selfEntry = null;
  for (const entry of msg.players) {
    seenIds.add(entry.id);
    if (entry.id === myId) { selfEntry = entry; continue; }
    getOrCreateRemote(entry);
  }
  for (const id of [...remotePlayers.keys()]) {
    if (!seenIds.has(id)) removeRemote(id);
  }

  if (selfEntry && localPlayer) {
    const prevHealth = localPlayer.lastHealth ?? selfEntry.health;
    if (selfEntry.health < prevHealth) hud.flashDamage();
    localPlayer.lastHealth = selfEntry.health;

    localPlayer.reconcile(selfEntry, msg.yourSeq);

    const weaponDef = WEAPONS[selfEntry.weapon];
    hud.updateHealth(selfEntry.health, 100);
    hud.updateWeapon(weaponDef.name, selfEntry.ammo, weaponDef.magazineSize, selfEntry.reloading);
    hud.updateDash(selfEntry.dashCooldown, DASH_COOLDOWN);
    if (currentWeaponId !== selfEntry.weapon) {
      currentWeaponId = selfEntry.weapon;
      setViewmodel(currentWeaponId);
    }

    if (!selfEntry.alive) {
      hud.showRespawn(lastKillerName, selfEntry.respawnIn);
    } else if (!wasAlive && selfEntry.alive) {
      hud.hideRespawn();
      lastKillerName = null;
    }
    wasAlive = selfEntry.alive;
  }

  if (msg.matchOver && !matchOverActive) {
    matchOverActive = true;
    matchOverAt = performance.now();
  } else if (!msg.matchOver && matchOverActive) {
    matchOverActive = false;
    hud.hideMatchOver();
  }
});

network.on('kill', (entry) => {
  hud.addKillFeed(entry);
  if (entry.victimName === myName) lastKillerName = entry.killerName;
});

network.on('score', (msg) => { latestScore = msg.score; hud.updateScore(latestScore); });

network.on('match_over', (msg) => {
  matchOverActive = true;
  matchOverWinner = msg.winner;
  matchOverAt = performance.now();
});

network.on('hit_confirm', () => hud.flashHitMarker());

network.on('explosion', (msg) => {
  effects.explosion(new THREE.Vector3(msg.x, msg.y, msg.z), msg.radius);
});

function join() {
  myName = nameInput.value.trim() || 'Soldier';
  const send = () => network.send({ type: MSG.JOIN, name: myName });
  if (network.connected) send(); else network.handlers.open = send;
}

joinBtn.addEventListener('click', join);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

function tryFire(now) {
  const weaponDef = WEAPONS[currentWeaponId];
  if (localFireCooldown > 0) localFireCooldown -= 1 / 60;

  const wantsFire = inputManager.firing;
  const edge = wantsFire && !prevFiringHeld;
  prevFiringHeld = wantsFire;

  const canTrigger = weaponDef.automatic ? wantsFire : edge;
  if (canTrigger && localFireCooldown <= 0 && wasAlive) {
    localFireCooldown = weaponDef.fireInterval;
    network.send({ type: MSG.FIRE, yaw: inputManager.yaw, pitch: inputManager.pitch });
    fireVfx();
  }
}

function fireVfx() {
  const muzzleWorld = new THREE.Vector3();
  viewmodelMuzzle.getWorldPosition(muzzleWorld);
  effects.muzzleFlash(muzzleWorld);

  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const raycaster = new THREE.Raycaster(camera.position, dir, 0.1, 150);
  const targets = [];
  scene.traverse((obj) => { if (obj.isMesh) targets.push(obj); });
  const hits = raycaster.intersectObjects(targets, false);
  const endPoint = hits.length ? hits[0].point : camera.position.clone().addScaledVector(dir, 100);
  effects.tracer(muzzleWorld, endPoint);
}

function handleWeaponSwitch() {
  const slot = inputManager.consumeSwitch();
  if (slot) {
    network.send({ type: MSG.SWITCH_WEAPON, slot });
  }
  if (inputManager.consumeReload()) {
    network.send({ type: MSG.RELOAD });
  }
}

function updateCamera() {
  if (!localPlayer) return;
  camera.position.set(localPlayer.movement.x, localPlayer.movement.y + PLAYER_EYE_HEIGHT, localPlayer.movement.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = inputManager.yaw + Math.PI;
  camera.rotation.x = inputManager.pitch;
  camera.rotation.z = 0;
}

function updateRemotes(now, dt) {
  for (const rec of remotePlayers.values()) {
    rec.group.visible = rec.remote.latest.alive !== false;
    const state = rec.remote.interpolate(now);
    rec.group.position.set(state.x, state.y, state.z);
    rec.group.rotation.y = state.yaw;

    const prev = rec.prevX ?? state.x;
    const prevZ = rec.prevZ ?? state.z;
    const speed = Math.hypot(state.x - prev, state.z - prevZ) / Math.max(dt, 0.001);
    rec.prevX = state.x; rec.prevZ = state.z;

    const moving = speed > 0.4;
    rec.animPhase += dt * (moving ? 7 : 2.5);
    const amp = moving ? 0.55 : 0.05;
    rec.group.userData.leftLeg.rotation.x = Math.sin(rec.animPhase) * amp;
    rec.group.userData.rightLeg.rotation.x = -Math.sin(rec.animPhase) * amp;
    rec.group.userData.leftArm.rotation.x = -Math.sin(rec.animPhase) * amp * 0.8;
  }
}

function updateMatchOverlay() {
  if (!matchOverActive) return;
  const elapsed = (performance.now() - matchOverAt) / 1000;
  const remaining = Math.max(0, Math.ceil(MATCH_RESTART_DELAY - elapsed));
  hud.showMatchOver(matchOverWinner || (latestScore.red > latestScore.blue ? 'red' : 'blue'), remaining);
}

function updateScoreboardVisibility() {
  hud.setScoreboardVisible(inputManager.tabHeld);
  if (inputManager.tabHeld) hud.updateScoreboard(latestPlayers, latestScore);
}

const FIXED_DT = 1 / TICK_RATE;
let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  effects.update(frameDt);
  hud.tick(frameDt);

  if (joined && localPlayer) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 8) {
      const input = localPlayer.buildInput(inputManager);
      localPlayer.step(input);
      network.send({ type: MSG.INPUT, ...input });
      accumulator -= FIXED_DT;
      steps += 1;
    }

    handleWeaponSwitch();
    tryFire(now);
    updateCamera();
    updateRemotes(now, frameDt);
    updateMatchOverlay();
    updateScoreboardVisibility();
    hud.setCrosshairSpread(WEAPONS[currentWeaponId].spread * 220);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);

window.__debug = { scene, camera, colliders, getLocalPlayer: () => localPlayer, getInput: () => inputManager };
