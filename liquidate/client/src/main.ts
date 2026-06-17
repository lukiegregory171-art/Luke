/**
 * Client bootstrap and screen flow.
 *
 * Menu → FIND MATCH (networked 1v1 against the authoritative server) or
 * PRACTICE RANGE (offline 1v1 vs a bot). Shared resources (renderer, input,
 * weapon, HUD, audio) are built once; the chosen controller drives the loop.
 */

import { DEFAULT_MAP, randomMap } from '@liquidate/shared';
import { World } from './world';
import { Input } from './input';
import { Weapon } from './weapon';
import { Hud } from './hud';
import { Sfx } from './audio';
import { Net } from './net';
import { Opponent } from './opponent';
import { Match, type MatchResult } from './match';
import { Practice } from './practice';

declare global {
  interface Window {
    // Minimal hook for E2E smoke tests (read-only view of screen state).
    __liq?: { state: string; selfScore: number; oppScore: number; locked: boolean; snaps: number };
  }
}

const container = document.getElementById('game') as HTMLElement;
const world = new World(container);
const input = new Input(world.domElement);
const gun = new Weapon(world.scene, world.camera);
const hud = new Hud();
const sfx = new Sfx();

const overlay = document.getElementById('overlay') as HTMLElement;
const cardMenu = document.getElementById('card-menu') as HTMLElement;
const cardSearch = document.getElementById('card-search') as HTMLElement;
const cardOver = document.getElementById('card-over') as HTMLElement;
const resumeHint = document.getElementById('resume-hint') as HTMLElement;

type AppState = 'menu' | 'searching' | 'playing' | 'over';
let appState: AppState = 'menu';
let mode: 'practice' | 'match' | null = null;
let controller: { update: (dt: number) => void } | null = null;

window.__liq = { state: appState, selfScore: 0, oppScore: 0, locked: false, snaps: 0 };
function setState(s: AppState): void {
  appState = s;
  window.__liq!.state = s;
}

function showCard(card: HTMLElement | null): void {
  overlay.classList.toggle('hidden', card === null);
  for (const c of [cardMenu, cardSearch, cardOver]) c.classList.toggle('hidden', c !== card);
}

document.getElementById('practice')!.addEventListener('click', startPractice);
document.getElementById('find-match')!.addEventListener('click', startMatch);
document.getElementById('cancel')!.addEventListener('click', () => location.reload());
document.getElementById('play-again')!.addEventListener('click', () => location.reload());
resumeHint.addEventListener('click', () => input.requestLock());

function startPractice(): void {
  sfx.resume();
  mode = 'practice';
  const map = randomMap();
  world.setMap(map);
  controller = new Practice(map, world, input, gun, hud, sfx);
  setState('playing');
  showCard(null);
  hud.show(true);
  input.requestLock();
}

function startMatch(): void {
  sfx.resume();
  mode = 'match';
  const net = new Net();
  const opponent = new Opponent(world.scene);
  const match = new Match(DEFAULT_MAP, world, input, gun, hud, net, opponent, sfx, {
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
  controller = match;
  match.connect();
  setState('searching');
  showCard(cardSearch);
  input.requestLock();
}

function showOver(result: MatchResult): void {
  setState('over');
  hud.show(false);
  resumeHint.classList.add('hidden');
  const title = document.getElementById('over-title') as HTMLElement;
  const detail = document.getElementById('over-detail') as HTMLElement;
  title.textContent = result.win ? 'VICTORY' : 'DEFEAT';
  title.className = 'small ' + (result.win ? 'win' : 'lose');
  detail.textContent = result.oppLeft
    ? 'Opponent left — match forfeited to you.'
    : `Final score  ${result.selfScore} — ${result.oppScore}`;
  showCard(cardOver);
  window.__liq!.selfScore = result.selfScore;
  window.__liq!.oppScore = result.oppScore;
  if (document.pointerLockElement) document.exitPointerLock();
}

input.onLockChange = (locked) => {
  window.__liq!.locked = locked;
  resumeHint.classList.toggle('hidden', !(appState === 'playing' && !locked));
};

// Frame loop: render every frame; let the active controller advance the sim.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (mode === 'practice') {
    if (input.locked) controller?.update(dt);
    else gun.update(dt);
  } else if (mode === 'match') {
    controller?.update(dt);
  }

  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
