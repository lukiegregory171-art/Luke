/**
 * Client bootstrap and screen flow.
 *
 * One persistent WebSocket carries both the lobby economy (login / deposit /
 * withdraw / queue, account + treasury updates) and the match. The lobby is the
 * entry point; FIND MATCH queues with a demo stake, PRACTICE RANGE is offline
 * vs a bot. Shared resources (renderer, input, weapon, HUD, audio) are built
 * once. All play-money is server-authoritative DEMO currency.
 */

import {
  DEFAULT_MAP,
  RARITY,
  SKINS,
  WEAPONS,
  WEAPON_IDS,
  accentHex,
  defaultLoadout,
  isSkinUnlocked,
  randomMap,
  skinPrice,
  skinsForWeapon,
  weaponSkinById,
  type AccountMessage,
  type ServerMessage,
  type Skin,
  type WeaponId,
  type WeaponSkin,
} from '@liquidate/shared';
import { World } from './world';
import { AssetManager } from './assets';
import { MANIFEST } from './manifest';
import { PerfHud } from './perf';
import { QUALITY_LEVELS, type QualityLevel } from './quality';
import { SettingsStore } from './settings';
import { Input } from './input';
import { Weapon } from './weapon';
import { Hud, scoreboardHTML } from './hud';
import { Sfx } from './audio';
import { Net } from './net';
import { Opponents } from './opponents';
import { Impacts } from './impacts';
import { Shake } from './shake';
import { Inspect } from './inspect';
import { setAvatarSource } from './avatarsource';
import { Match, type MatchResult } from './match';
import { Practice } from './practice';
import { Lobby } from './lobby';
import { applySkin, savedSkin } from './cosmetics';
import { TOKEN_ENABLED, connectPhantom, fetchTokenBalance } from './token';

declare global {
  interface Window {
    __liq?: {
      state: string;
      balance: number;
      net: number;
      locked: boolean;
      snaps: number;
      fps: number;
      draws: number;
    };
  }
}

const HANDLE_KEY = 'liquidate_handle';

const container = document.getElementById('game') as HTMLElement;
const perf = new PerfHud();
const world = new World(container, perf);
const input = new Input(world.domElement);
const gun = new Weapon(world.scene, world.camera);
const hud = new Hud();
const sfx = new Sfx();
const net = new Net();
const opponents = new Opponents(world.scene);
const impacts = new Impacts(world.scene);
const shake = new Shake();
const lobby = new Lobby();

// Player preferences (P6): audio volume/mute + mouse sensitivity, persisted.
const settings = new SettingsStore();
input.sensitivity = settings.sensitivityRadians;
world.setFov(settings.fov);
sfx.setVolume(settings.volume);
sfx.setMuted(settings.muted);

// Asset pipeline (P1). The manifest now registers the rigged avatar + CC0
// environment props; the AssetManager streams them (with the loading-screen
// progress bar) and the world dresses maps with the props once resident.
const assets = new AssetManager(world.renderer);
assets.register(MANIFEST);
world.setAssets(assets);
gun.setAssets(assets); // real GLB weapon models for the archetypes that have them

const overlay = document.getElementById('overlay') as HTMLElement;
const cardMenu = document.getElementById('card-menu') as HTMLElement;
const cardSearch = document.getElementById('card-search') as HTMLElement;
const cardOver = document.getElementById('card-over') as HTMLElement;
const cardInventory = document.getElementById('card-inventory') as HTMLElement;
const resumeHint = document.getElementById('resume-hint') as HTMLElement;

type AppState = 'lobby' | 'searching' | 'playing' | 'over';
let appState: AppState = 'lobby';
let mode: 'practice' | 'match' | null = null;
let selfId = '';
let match: Match | null = null;
let practice: Practice | null = null;

window.__liq = { state: appState, balance: 0, net: 0, locked: false, snaps: 0, fps: 0, draws: 0 };
function setState(s: AppState): void {
  appState = s;
  window.__liq!.state = s;
}

function showCard(card: HTMLElement | null): void {
  overlay.classList.toggle('hidden', card === null);
  for (const c of [cardMenu, cardSearch, cardOver, cardInventory])
    c.classList.toggle('hidden', c !== card);
}

// --- Networking dispatch ---------------------------------------------------
net.onMessage = (msg: ServerMessage) => {
  switch (msg.type) {
    case 'init':
      selfId = msg.id;
      autoLogin();
      break;
    case 'account':
      lobby.setAccount(msg);
      window.__liq!.balance = msg.balance;
      onAccount(msg);
      break;
    case 'treasury':
      lobby.setTreasury(msg.balance);
      break;
    default:
      match?.handle(msg);
  }
};
net.connect();

function autoLogin(): void {
  const saved = localStorage.getItem(HANDLE_KEY);
  if (saved) {
    lobby.prefillHandle(saved);
    net.send({ type: 'login', handle: saved });
  }
}

// --- Lobby actions ---------------------------------------------------------
lobby.onLogin = (handle) => {
  localStorage.setItem(HANDLE_KEY, handle);
  net.send({ type: 'login', handle });
};
lobby.onDeposit = (amount) => net.send({ type: 'deposit', amount });
lobby.onWithdraw = (amount) => net.send({ type: 'withdraw', amount });
lobby.onQueue = (stake) => startMatch(stake, 'duel');
lobby.onFfa = () => startMatch(0, 'ffa');
lobby.onTdm = () => startMatch(0, 'tdm');
lobby.onPractice = startPractice;

document.getElementById('cancel')!.addEventListener('click', () => location.reload());
document.getElementById('play-again')!.addEventListener('click', backToLobby);
resumeHint.addEventListener('click', () => input.requestLock());

function startMatch(stake: number, queueMode: 'duel' | 'ffa' | 'tdm'): void {
  sfx.resume();
  mode = 'match';
  match = new Match(selfId, DEFAULT_MAP, world, input, gun, hud, net, opponents, sfx, impacts, shake, {
    onSearching: () => {
      setState('searching');
      showCard(cardSearch);
      hud.show(false);
    },
    onPlaying: () => {
      setState('playing');
      showCard(null);
      hud.show(true);
      sfx.startAmbient();
    },
    onOver: showOver,
    onSnapshot: () => window.__liq!.snaps++,
  });
  net.send({ type: 'queue', stake, mode: queueMode });
  setState('searching');
  showCard(cardSearch);
  input.requestLock();
}

function startPractice(): void {
  sfx.resume();
  mode = 'practice';
  const map = randomMap();
  world.setMap(map);
  practice = new Practice(map, world, input, gun, hud, sfx, impacts, shake);
  setState('playing');
  showCard(null);
  hud.show(true);
  sfx.startAmbient();
  input.requestLock();
}

function showOver(result: MatchResult): void {
  setState('over');
  mode = null;
  match = null;
  hud.show(false);
  hud.showScoreboard(null);
  sfx.stopAmbient();
  sfx.thrustOn(false);
  resumeHint.classList.add('hidden');
  window.__liq!.net = result.net;
  const title = document.getElementById('over-title') as HTMLElement;
  const detail = document.getElementById('over-detail') as HTMLElement;
  const boardEl = document.getElementById('over-board') as HTMLElement;

  if (result.mode === 'tdm') {
    title.textContent = result.win ? 'VICTORY' : 'DEFEAT';
    title.className = 'small ' + (result.win ? 'win' : 'lose');
    detail.textContent = result.win
      ? `Your team won. You scored ${result.selfScore} frags. Team deathmatch — no stake.`
      : `Your team lost. You scored ${result.selfScore} frags. Team deathmatch — no stake.`;
  } else if (result.mode === 'ffa') {
    // FFA: placement out of the field; free, so no economy line.
    const win = result.place === 1;
    title.textContent = win ? 'VICTORY' : `#${result.place} / ${result.board.length}`;
    title.className = 'small ' + (win ? 'win' : 'lose');
    detail.textContent = win
      ? `You topped the lobby with ${result.selfScore} frags.`
      : `You placed #${result.place} with ${result.selfScore} frags. Free-for-all — no stake.`;
  } else {
    title.textContent = result.win ? 'VICTORY' : 'DEFEAT';
    title.className = 'small ' + (result.win ? 'win' : 'lose');
    const sign = result.net >= 0 ? '+' : '−';
    const econ = result.oppLeft
      ? 'Opponent left — match forfeited to you. '
      : `Pot ${result.pot} · rake ${result.rake}. `;
    detail.textContent = `${econ}You ${result.net >= 0 ? 'won' : 'lost'} ${sign}${Math.abs(result.net)} DEMO.`;
  }
  boardEl.innerHTML = scoreboardHTML(result.board, 'FINAL');
  showCard(cardOver);
  if (document.pointerLockElement) document.exitPointerLock();
}

function backToLobby(): void {
  setState('lobby');
  mode = null;
  match = null;
  gun.reset(); // retire any lingering tracers (back to the pool)
  impacts.reset();
  shake.reset();
  sfx.stopAmbient();
  sfx.thrustOn(false);
  hud.show(false);
  hud.showScoreboard(null);
  showCard(cardMenu);
}

input.onLockChange = (locked) => {
  window.__liq!.locked = locked;
  resumeHint.classList.toggle('hidden', !(appState === 'playing' && !locked));
};

// Graphics quality selector (P0).
const qualitySel = document.getElementById('quality') as HTMLSelectElement;
qualitySel.value = world.qualityLevel; // reflects saved pref or auto-detected default
qualitySel.addEventListener('change', () => {
  if (QUALITY_LEVELS.includes(qualitySel.value as QualityLevel)) {
    world.applyQuality(qualitySel.value as QualityLevel);
  }
});

// Audio + sensitivity settings (P6).
const volEl = document.getElementById('opt-volume') as HTMLInputElement;
const muteEl = document.getElementById('opt-mute') as HTMLInputElement;
const sensEl = document.getElementById('opt-sens') as HTMLInputElement;
const fovEl = document.getElementById('opt-fov') as HTMLInputElement;
volEl.value = String(Math.round(settings.volume * 100));
muteEl.checked = settings.muted;
sensEl.value = String(Math.round(settings.sensitivity * 100));
fovEl.value = String(Math.round(settings.fov));
volEl.addEventListener('input', () => {
  settings.volume = Number(volEl.value) / 100;
  sfx.setVolume(settings.volume);
});
muteEl.addEventListener('change', () => {
  settings.muted = muteEl.checked;
  sfx.setMuted(settings.muted);
});
sensEl.addEventListener('input', () => {
  settings.sensitivity = Number(sensEl.value) / 100;
  input.sensitivity = settings.sensitivityRadians;
});
fovEl.addEventListener('input', () => {
  settings.fov = Number(fovEl.value);
  world.setFov(settings.fov);
});

// UI click feedback: resume audio on the first gesture, then click on buttons.
let audioArmed = false;
document.addEventListener('pointerdown', (e) => {
  if (!audioArmed) {
    sfx.resume();
    sfx.setVolume(settings.volume);
    sfx.setMuted(settings.muted);
    audioArmed = true;
  }
  if ((e.target as HTMLElement).closest('button')) sfx.ui();
});

// --- Colour theme (M5: UI/arena accent, optionally devnet-token gated) ------
let tokenBalance = 0;
let selectedSkin = savedSkin();

// Apply a colour theme to UI accent (CSS) + the in-world arena accent. The
// per-weapon GUN look is driven by the weapon-skins locker below, not this.
// Client-local cosmetics — never sent to the server, never affect the opponent's
// (fixed, readable) appearance.
function theme(skin: Skin): void {
  applySkin(skin);
  world.setAccent(accentHex(skin));
}
theme(selectedSkin);

const skinsEl = document.getElementById('skins') as HTMLElement;
function renderSkins(): void {
  skinsEl.innerHTML = '';
  for (const skin of SKINS) {
    const unlocked = isSkinUnlocked(skin, tokenBalance);
    const b = document.createElement('button');
    b.className =
      'swatch' + (skin.id === selectedSkin.id ? ' sel' : '') + (unlocked ? '' : ' locked');
    b.style.background = skin.color;
    b.title = unlocked ? skin.name : `${skin.name} — needs ${skin.requires} devnet token`;
    if (unlocked) {
      b.addEventListener('click', () => {
        selectedSkin = skin;
        theme(skin);
        renderSkins();
      });
    }
    skinsEl.appendChild(b);
  }
}
renderSkins();

// --- Weapon-skins locker (Part B) ------------------------------------------
// Server-authoritative ownership: `owned`/`loadout`/`balance` come from the
// account message; we can only EQUIP what the server says we own, and buying is
// a server transaction. Skins are cosmetic — they never change stats or hits.
let owned = new Set<string>();
let loadout: Record<WeaponId, string> = defaultLoadout();
let walletBalance = 0;
let loggedIn = false;

const inspect = new Inspect(document.getElementById('inspect-canvas') as HTMLCanvasElement);
inspect.setAssets(assets);
const lockerWeaponsEl = document.getElementById('locker-weapons') as HTMLElement;
const invSkinsEl = document.getElementById('inv-skins') as HTMLElement;
const invNameEl = document.getElementById('inv-name') as HTMLElement;
const invReqEl = document.getElementById('inv-req') as HTMLElement;
const invEquipBtn = document.getElementById('inv-equip') as HTMLButtonElement;
const invBuyBtn = document.getElementById('inv-buy') as HTMLButtonElement;
const lockerBalanceEl = document.getElementById('locker-balance') as HTMLElement;

let lockerWeapon: WeaponId = 'assault';
let previewSkin: WeaponSkin = weaponSkinById(loadout.assault) ?? skinsForWeapon('assault')[0];

// Apply the equipped loadout to the first-person viewmodel.
gun.setLoadout(loadout);

/** Account update: refresh ownership/loadout, re-skin the gun, refresh locker. */
function onAccount(msg: AccountMessage): void {
  loggedIn = true;
  owned = new Set(msg.owned);
  loadout = msg.loadout;
  walletBalance = msg.balance;
  gun.setLoadout(loadout);
  if (!cardInventory.classList.contains('hidden')) renderLocker();
}

function renderLockerWeapons(): void {
  lockerWeaponsEl.innerHTML = '';
  for (const id of WEAPON_IDS) {
    const b = document.createElement('button');
    b.className = 'wpn-pick' + (id === lockerWeapon ? ' sel' : '');
    b.textContent = WEAPONS[id].name;
    b.addEventListener('click', () => {
      lockerWeapon = id;
      previewSkin = weaponSkinById(loadout[id]) ?? skinsForWeapon(id)[0];
      renderLocker();
    });
    lockerWeaponsEl.appendChild(b);
  }
}

function renderLockerSkins(): void {
  invSkinsEl.innerHTML = '';
  for (const skin of skinsForWeapon(lockerWeapon)) {
    const meta = RARITY[skin.rarity];
    const isOwned = owned.has(skin.id) || skinPrice(skin) === 0;
    const isEquipped = loadout[lockerWeapon] === skin.id;
    const tile = document.createElement('button');
    tile.className =
      'skin-tile' + (skin.id === previewSkin.id ? ' on' : '') + (isEquipped ? ' equipped' : '');
    tile.style.borderColor = meta.color;
    tile.dataset.id = skin.id;
    const tag = isEquipped ? 'EQUIPPED' : isOwned ? '' : `${skinPrice(skin)}`;
    tile.innerHTML =
      `<span class="tile-swatch" style="background:linear-gradient(135deg, ${skin.base} 0 55%, ${skin.secondary} 55% 100%)"></span>` +
      `<span class="tile-name">${escapeHtml(skin.name)}</span>` +
      `<span class="tile-rarity" style="color:${meta.color}">${meta.label}</span>` +
      (tag ? `<span class="tile-tag${isEquipped ? ' eq' : ' price'}">${tag}</span>` : '') +
      (isOwned || isEquipped ? '' : '<span class="tile-lock">🔒</span>');
    tile.addEventListener('click', () => preview(skin));
    invSkinsEl.appendChild(tile);
  }
}

function preview(skin: WeaponSkin): void {
  previewSkin = skin;
  inspect.show(skin);
  const meta = RARITY[skin.rarity];
  invNameEl.textContent = skin.name;
  invNameEl.style.color = meta.color;
  const isOwned = owned.has(skin.id) || skinPrice(skin) === 0;
  const isEquipped = loadout[skin.weapon] === skin.id;
  invReqEl.textContent = isEquipped
    ? `${meta.label} · EQUIPPED`
    : isOwned
      ? `${meta.label} · Owned`
      : `${meta.label} · ${skinPrice(skin)} DEMO`;
  invReqEl.style.color = meta.color;
  invEquipBtn.disabled = !isOwned || isEquipped;
  invBuyBtn.classList.toggle('hidden', isOwned);
  invBuyBtn.disabled = !loggedIn || walletBalance < skinPrice(skin);
  invBuyBtn.textContent = `BUY · ${skinPrice(skin)}`;
  for (const el of Array.from(invSkinsEl.children) as HTMLElement[]) {
    el.classList.toggle('on', el.dataset.id === skin.id);
  }
}

function renderLocker(): void {
  lockerBalanceEl.textContent = loggedIn ? `${walletBalance} DEMO` : 'sign in to buy';
  renderLockerWeapons();
  renderLockerSkins();
  preview(previewSkin);
}

function openArsenal(): void {
  lockerWeapon = previewSkin.weapon;
  renderLocker();
  showCard(cardInventory);
  inspect.start();
  requestAnimationFrame(() => inspect.resize());
}

document.getElementById('lobby-arsenal')!.addEventListener('click', openArsenal);
invEquipBtn.addEventListener('click', () => {
  const isOwned = owned.has(previewSkin.id) || skinPrice(previewSkin) === 0;
  if (!isOwned) return;
  // Optimistic local apply; the server validates ownership and echoes the
  // authoritative loadout in the next account message.
  loadout[previewSkin.weapon] = previewSkin.id;
  gun.setLoadout(loadout);
  net.send({ type: 'equipSkin', weapon: previewSkin.weapon, skinId: previewSkin.id });
  renderLocker();
});
invBuyBtn.addEventListener('click', () => {
  if (!loggedIn || owned.has(previewSkin.id)) return;
  net.send({ type: 'buySkin', skinId: previewSkin.id });
});
document.getElementById('inv-close')!.addEventListener('click', () => {
  inspect.stop();
  showCard(cardMenu);
});

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

if (TOKEN_ENABLED) {
  const wallet = document.getElementById('wallet') as HTMLElement;
  const status = document.getElementById('wallet-status') as HTMLElement;
  const addr = document.getElementById('wallet-addr') as HTMLInputElement;
  wallet.classList.remove('hidden');

  async function loadBalance(address: string): Promise<void> {
    status.textContent = 'Reading devnet balance…';
    try {
      tokenBalance = await fetchTokenBalance(address);
      status.textContent = `Devnet token balance: ${tokenBalance} (cosmetic only)`;
      renderSkins();
    } catch {
      status.textContent = 'Could not read devnet balance.';
    }
  }
  document.getElementById('wallet-connect')!.addEventListener('click', async () => {
    const pk = await connectPhantom();
    if (pk) {
      addr.value = pk;
      await loadBalance(pk);
    } else {
      status.textContent = 'No Phantom wallet found — paste a devnet address instead.';
    }
  });
  document.getElementById('wallet-check')!.addEventListener('click', () => {
    if (addr.value.trim()) void loadBalance(addr.value.trim());
  });
}

// --- Boot: preload assets + warm the renderer behind the loading screen (P1) ---
const loadingEl = document.getElementById('loading') as HTMLElement;
const loadingFill = document.getElementById('loading-fill') as HTMLElement;
const loadingLabel = document.getElementById('loading-label') as HTMLElement;

async function boot(): Promise<void> {
  // Assets take the first 80% of the bar; shader warmup the last 20%.
  await assets.preloadCritical((p) => {
    loadingFill.style.width = `${Math.round(p.fraction * 70)}%`;
    loadingLabel.textContent = p.label;
  });

  // Load the rigged player avatar (with its animation clips). If it fails, the
  // procedural figure is the fallback — never block reaching the lobby.
  loadingLabel.textContent = 'Loading characters…';
  loadingFill.style.width = '80%';
  try {
    const gltf = await assets.loadGLTF('avatar');
    setAvatarSource(gltf.scene, gltf.animations);
  } catch {
    // No rig — procedural avatars will be used.
  }

  loadingLabel.textContent = 'Warming renderer…';
  try {
    await world.warmup();
  } catch {
    // Warmup is an optimisation; never let it block reaching the lobby.
  }
  loadingFill.style.width = '100%';
  loadingLabel.textContent = 'Ready';
  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.classList.add('hidden'), 500);
}
void boot();

// --- Frame loop ------------------------------------------------------------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (mode === 'practice') {
    if (input.locked) practice?.update(dt);
    else gun.update(dt);
  } else if (mode === 'match') {
    match?.update(dt);
  } else {
    gun.update(dt);
  }

  // Combat juice (P3): shake offsets the camera AFTER it's set from input
  // (authority-safe), then impacts fade. Both run every frame so effects keep
  // animating/decaying even between modes.
  shake.update(dt, world.camera);
  impacts.update(dt, world.camera);

  world.render(dt);
  window.__liq!.fps = perf.fps;
  window.__liq!.draws = perf.drawCalls;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
