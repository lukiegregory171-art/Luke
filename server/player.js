import { createMovementState } from '../public/modules/shared/movement.js';
import { WEAPONS } from '../public/modules/shared/weapons.js';
import { randomSpawn } from '../public/modules/shared/mapData.js';
import { RESPAWN_TIME, TEAM } from '../public/modules/shared/constants.js';

let nextPlayerNum = 1;

export class Player {
  constructor(id, socket, team, name) {
    this.id = id;
    this.socket = socket;
    this.team = team;
    this.name = name && name.trim() ? name.trim().slice(0, 16) : `Soldier${nextPlayerNum++}`;

    const spawn = randomSpawn(team);
    this.movement = createMovementState(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.pitch = 0;

    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.respawnTimer = 0;

    this.weapon = 'ar';
    this.ammo = { ar: WEAPONS.ar.magazineSize, shotgun: WEAPONS.shotgun.magazineSize, sniper: WEAPONS.sniper.magazineSize, rocket: WEAPONS.rocket.magazineSize };
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.consecutiveShots = 0;

    this.kills = 0;
    this.deaths = 0;

    this.inputQueue = [];
    this.lastProcessedSeq = 0;
  }

  respawn() {
    const spawn = randomSpawn(this.team);
    this.movement = createMovementState(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.pitch = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.weapon = 'ar';
    for (const key of Object.keys(this.ammo)) this.ammo[key] = WEAPONS[key].magazineSize;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
  }

  die() {
    this.alive = false;
    this.deaths += 1;
    this.respawnTimer = RESPAWN_TIME;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      x: round2(this.movement.x),
      y: round2(this.movement.y),
      z: round2(this.movement.z),
      yaw: round3(this.movement.yaw),
      pitch: round3(this.pitch),
      health: Math.round(this.health),
      alive: this.alive,
      weapon: this.weapon,
      ammo: this.ammo[this.weapon],
      reloading: this.reloading,
      dashCooldown: round2(this.movement.dashCooldown),
      kills: this.kills,
      deaths: this.deaths,
      respawnIn: this.alive ? 0 : Math.ceil(this.respawnTimer),
    };
  }
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

export function pickTeam(players) {
  let red = 0;
  let blue = 0;
  for (const p of players.values()) {
    if (p.team === TEAM.RED) red++; else blue++;
  }
  if (red < blue) return TEAM.RED;
  if (blue < red) return TEAM.BLUE;
  return Math.random() < 0.5 ? TEAM.RED : TEAM.BLUE;
}
