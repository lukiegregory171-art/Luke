/**
 * Client bootstrap and screen flow.
 *
 * Menu → FIND MATCH (networked 1v1 against the authoritative server) or
 * PRACTICE RANGE (M1 solo). Shared resources (renderer, input, weapon, HUD) are
 * built once; the chosen controller drives the frame loop.
 */

import { DEFAULT_MAP } from '@liquidate/shared';
import { World } from './world';
import { Input } from './input';
import { Weapon } from './weapon';
import { Hud } from './hud';
import { Game } from './game';
import { Dummy } from './dummy';
import { Net } from './net';
import { Opponent } from './opponent';
import { Match, type MatchResult } from './match';

declare global {
  interface Window {
    // Minimal hook for E2E smoke tests (read-only view of screen state).
    __liq?: { state: string; selfScore: number; oppScore: number; locked: boolean; snaps: number };
  }
}

const map = DEFAULT_MAP;
const container = document.getElementById('game') as HTMLElement;
const world = new World(container, map);
const input = new Input(world.domElement);
const weapon = new Weapon(world.scene, world.camera);
const hud = new Hud();

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
  mode = 'practice';
  const dummy = new Dummy(world.scene, map);
  const game = new Game(map, world, input, weapon, dummy, hud);
  dummy.avoidProvider = () => game.playerFeet;
  controller = game;
  setState('playing');
  showCard(null);
  hud.show(true);
  input.requestLock();
}

function startMatch(): void {
  mode = 'match';
  const net = new Net();
  const opponent = new Opponent(world.scene);
  const match = new Match(map, world, input, weapon, hud, net, opponent, {
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
  // Show a "click to resume" prompt only while actively playing.
  resumeHint.classList.toggle('hidden', !(appState === 'playing' && !locked));
};

// Frame loop: render every frame; let the active controller advance the sim.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (mode === 'practice') {
    if (input.locked) controller?.update(dt);
    else weapon.update(dt);
  } else if (mode === 'match') {
    controller?.update(dt); // Match samples movement only while locked, internally
  }

  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
