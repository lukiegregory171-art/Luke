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
  SKINS,
  isSkinUnlocked,
  randomMap,
  type ServerMessage,
} from '@liquidate/shared';
import { World } from './world';
import { Input } from './input';
import { Weapon } from './weapon';
import { Hud } from './hud';
import { Sfx } from './audio';
import { Net } from './net';
import { Opponent } from './opponent';
import { Match, type MatchResult } from './match';
import { Practice } from './practice';
import { Lobby } from './lobby';
import { applySkin, savedSkin } from './cosmetics';
import { TOKEN_ENABLED, connectPhantom, fetchTokenBalance } from './token';

declare global {
  interface Window {
    __liq?: { state: string; balance: number; net: number; locked: boolean; snaps: number };
  }
}

const HANDLE_KEY = 'liquidate_handle';

const container = document.getElementById('game') as HTMLElement;
const world = new World(container);
const input = new Input(world.domElement);
const gun = new Weapon(world.scene, world.camera);
const hud = new Hud();
const sfx = new Sfx();
const net = new Net();
const opponent = new Opponent(world.scene);
const lobby = new Lobby();

const overlay = document.getElementById('overlay') as HTMLElement;
const cardMenu = document.getElementById('card-menu') as HTMLElement;
const cardSearch = document.getElementById('card-search') as HTMLElement;
const cardOver = document.getElementById('card-over') as HTMLElement;
const resumeHint = document.getElementById('resume-hint') as HTMLElement;

type AppState = 'lobby' | 'searching' | 'playing' | 'over';
let appState: AppState = 'lobby';
let mode: 'practice' | 'match' | null = null;
let selfId = '';
let match: Match | null = null;
let practice: Practice | null = null;

window.__liq = { state: appState, balance: 0, net: 0, locked: false, snaps: 0 };
function setState(s: AppState): void {
  appState = s;
  window.__liq!.state = s;
}

function showCard(card: HTMLElement | null): void {
  overlay.classList.toggle('hidden', card === null);
  for (const c of [cardMenu, cardSearch, cardOver]) c.classList.toggle('hidden', c !== card);
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
lobby.onQueue = (stake) => startMatch(stake);
lobby.onPractice = startPractice;

document.getElementById('cancel')!.addEventListener('click', () => location.reload());
document.getElementById('play-again')!.addEventListener('click', backToLobby);
resumeHint.addEventListener('click', () => input.requestLock());

function startMatch(stake: number): void {
  sfx.resume();
  mode = 'match';
  match = new Match(selfId, DEFAULT_MAP, world, input, gun, hud, net, opponent, sfx, {
    onSearching: () => {
      setState('searching');
      showCard(cardSearch);
      hud.show(false);
    },
    onPlaying: () => {
      setState('playing');
      showCard(null);
      hud.show(true);
    },
    onOver: showOver,
    onSnapshot: () => window.__liq!.snaps++,
  });
  net.send({ type: 'queue', stake });
  setState('searching');
  showCard(cardSearch);
  input.requestLock();
}

function startPractice(): void {
  sfx.resume();
  mode = 'practice';
  const map = randomMap();
  world.setMap(map);
  practice = new Practice(map, world, input, gun, hud, sfx);
  setState('playing');
  showCard(null);
  hud.show(true);
  input.requestLock();
}

function showOver(result: MatchResult): void {
  setState('over');
  mode = null;
  match = null;
  hud.show(false);
  resumeHint.classList.add('hidden');
  window.__liq!.net = result.net;
  const title = document.getElementById('over-title') as HTMLElement;
  const detail = document.getElementById('over-detail') as HTMLElement;
  title.textContent = result.win ? 'VICTORY' : 'DEFEAT';
  title.className = 'small ' + (result.win ? 'win' : 'lose');
  const sign = result.net >= 0 ? '+' : '−';
  const econ = result.oppLeft
    ? 'Opponent left — match forfeited to you. '
    : `Pot ${result.pot} · rake ${result.rake}. `;
  detail.textContent = `${econ}You ${result.net >= 0 ? 'won' : 'lost'} ${sign}${Math.abs(result.net)} DEMO.`;
  showCard(cardOver);
  if (document.pointerLockElement) document.exitPointerLock();
}

function backToLobby(): void {
  setState('lobby');
  mode = null;
  match = null;
  hud.show(false);
  showCard(cardMenu);
}

input.onLockChange = (locked) => {
  window.__liq!.locked = locked;
  resumeHint.classList.toggle('hidden', !(appState === 'playing' && !locked));
};

// --- Cosmetics (M5: skins, optionally devnet-token gated) ------------------
let tokenBalance = 0;
let selectedSkin = savedSkin();
applySkin(selectedSkin);

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
        applySkin(skin);
        renderSkins();
      });
    }
    skinsEl.appendChild(b);
  }
}
renderSkins();

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

  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
