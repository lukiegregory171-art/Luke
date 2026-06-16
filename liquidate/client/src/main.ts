/**
 * M1 bootstrap: build the world from the shared map, wire up input, weapon,
 * target dummy, HUD, and the game loop, and drive pointer-lock from the menu.
 *
 * This milestone is solo and fully client-side — the authoritative server and
 * networking arrive in M2. Movement and hit math come from @liquidate/shared so
 * the server can reuse them unchanged.
 */

import { DEFAULT_MAP } from '@liquidate/shared';
import { World } from './world';
import { Input } from './input';
import { Weapon } from './weapon';
import { Dummy } from './dummy';
import { Hud } from './hud';
import { Game } from './game';

const container = document.getElementById('game') as HTMLElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;

const map = DEFAULT_MAP;
const world = new World(container, map);
const input = new Input(world.domElement);
const weapon = new Weapon(world.scene, world.camera);
const dummy = new Dummy(world.scene, map);
const hud = new Hud();
const game = new Game(map, world, input, weapon, dummy, hud);

// Keep the dummy from respawning on top of the player.
dummy.avoidProvider = () => game.playerFeet;

// Menu / pause flow.
playBtn.addEventListener('click', () => input.requestLock());
input.onLockChange = (locked) => {
  overlay.classList.toggle('hidden', locked);
  hud.show(locked);
  if (!locked) playBtn.textContent = 'CLICK TO RESUME';
};

// Fixed-ish loop: render every frame, only simulate while locked (playing).
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1); // clamp big gaps (tab switches)
  last = now;

  if (input.locked) game.update(dt);
  else weapon.update(dt); // keep tracers/flash fading while paused

  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
