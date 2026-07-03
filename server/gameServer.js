import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

import {
  MSG,
  TICK_RATE,
  TICK_DT,
  SNAPSHOT_RATE,
  KILL_LIMIT,
  PLAYER_EYE_HEIGHT,
  MATCH_RESTART_DELAY,
} from '../public/modules/shared/constants.js';
import { ARENA_HALF_SIZE, buildArenaColliders } from '../public/modules/shared/mapData.js';
import { WEAPONS, WEAPON_SLOT, computeFalloffDamage, computeSplashDamage } from '../public/modules/shared/weapons.js';
import { simulateMovementTick } from '../public/modules/shared/movement.js';
import { rayIntersectsAABB, playerHitbox, nearestWorldHit } from '../public/modules/shared/raycast.js';
import { Player, pickTeam } from './player.js';

const MAX_HITSCAN_RANGE = 160;
const PROJECTILE_HIT_RADIUS = 1.1;

function sanitizeInput(msg) {
  return {
    seq: Number(msg.seq) || 0,
    forward: !!msg.forward,
    back: !!msg.back,
    left: !!msg.left,
    right: !!msg.right,
    sprint: !!msg.sprint,
    jump: !!msg.jump,
    dash: !!msg.dash,
    yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0,
    pitch: Math.max(-1.5, Math.min(1.5, Number.isFinite(msg.pitch) ? msg.pitch : 0)),
  };
}

export class GameServer {
  constructor(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer });
    this.players = new Map();
    this.colliders = buildArenaColliders();
    this.projectiles = [];
    this.killFeed = [];
    this.score = { red: 0, blue: 0 };
    this.matchOver = false;
    this.matchRestartTimer = 0;
    this.nextProjectileId = 1;
    this.snapshotAccum = 0;

    this.wss.on('connection', (socket) => this.handleConnection(socket));
    setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  handleConnection(socket) {
    let player = null;

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;

      if (!player) {
        if (msg.type === MSG.JOIN) {
          const id = randomUUID();
          const team = pickTeam(this.players);
          player = new Player(id, socket, team, msg.name);
          this.players.set(id, player);
          socket.send(JSON.stringify({
            type: MSG.WELCOME,
            id,
            team,
            score: this.score,
            players: [...this.players.values()].map((p) => p.serialize()),
          }));
          this.broadcast({ type: MSG.PLAYER_JOIN, id, name: player.name, team }, id);
        }
        return;
      }

      this.handleMessage(player, msg);
    });

    socket.on('close', () => {
      if (player) {
        this.players.delete(player.id);
        this.broadcast({ type: MSG.PLAYER_LEAVE, id: player.id });
      }
    });
    socket.on('error', () => {});
  }

  handleMessage(player, msg) {
    switch (msg.type) {
      case MSG.INPUT:
        if (player.inputQueue.length < 12) player.inputQueue.push(sanitizeInput(msg));
        break;
      case MSG.FIRE:
        this.handleFire(player, msg);
        break;
      case MSG.RELOAD:
        this.startReload(player);
        break;
      case MSG.SWITCH_WEAPON:
        this.switchWeapon(player, Number(msg.slot));
        break;
      default:
        break;
    }
  }

  switchWeapon(player, slot) {
    if (!player.alive) return;
    const weaponId = WEAPON_SLOT[slot];
    if (!weaponId || weaponId === player.weapon) return;
    player.weapon = weaponId;
    player.reloading = false;
    player.fireCooldown = Math.max(player.fireCooldown, 0.12);
  }

  startReload(player) {
    if (!player.alive || player.reloading) return;
    const weapon = WEAPONS[player.weapon];
    if (player.ammo[player.weapon] >= weapon.magazineSize) return;
    player.reloading = true;
    player.reloadTimer = weapon.reloadTime;
  }

  handleFire(player, msg) {
    if (!player.alive || player.reloading || player.fireCooldown > 0) return;
    const weapon = WEAPONS[player.weapon];
    if (player.ammo[player.weapon] <= 0) { this.startReload(player); return; }

    player.ammo[player.weapon] -= 1;
    player.fireCooldown = weapon.fireInterval;

    const yaw = Number.isFinite(msg.yaw) ? msg.yaw : player.movement.yaw;
    const pitch = Math.max(-1.4, Math.min(1.4, Number.isFinite(msg.pitch) ? msg.pitch : 0));

    if (weapon.hitscan) {
      this.resolveHitscan(player, weapon, yaw, pitch);
    } else {
      this.spawnRocket(player, weapon, yaw, pitch);
    }

    if (player.ammo[player.weapon] <= 0) this.startReload(player);
  }

  resolveHitscan(shooter, weapon, yaw, pitch) {
    const ox = shooter.movement.x;
    const oy = shooter.movement.y + PLAYER_EYE_HEIGHT;
    const oz = shooter.movement.z;
    const damageByTarget = new Map();

    for (let i = 0; i < weapon.pellets; i++) {
      const sYaw = yaw + (Math.random() * 2 - 1) * weapon.spread;
      const sPitch = Math.max(-1.5, Math.min(1.5, pitch + (Math.random() * 2 - 1) * weapon.spread));
      const dx = Math.sin(sYaw) * Math.cos(sPitch);
      const dy = Math.sin(sPitch);
      const dz = Math.cos(sYaw) * Math.cos(sPitch);

      const worldDist = nearestWorldHit(ox, oy, oz, dx, dy, dz, this.colliders, MAX_HITSCAN_RANGE);

      let bestTarget = null;
      let bestT = worldDist;
      for (const target of this.players.values()) {
        if (target.id === shooter.id || !target.alive || target.team === shooter.team) continue;
        const box = playerHitbox(target.movement.x, target.movement.y, target.movement.z);
        const t = rayIntersectsAABB(ox, oy, oz, dx, dy, dz, box);
        if (t !== null && t < bestT) { bestT = t; bestTarget = target; }
      }

      if (bestTarget) {
        const dmg = computeFalloffDamage(weapon, bestT);
        damageByTarget.set(bestTarget.id, (damageByTarget.get(bestTarget.id) || 0) + dmg);
      }
    }

    let hitAnyone = false;
    for (const [targetId, dmg] of damageByTarget) {
      const target = this.players.get(targetId);
      if (!target) continue;
      hitAnyone = true;
      this.applyDamage(shooter, target, dmg, weapon.id);
    }
    if (hitAnyone) this.sendTo(shooter, { type: MSG.HIT_CONFIRM });
  }

  spawnRocket(shooter, weapon, yaw, pitch) {
    const ox = shooter.movement.x;
    const oy = shooter.movement.y + PLAYER_EYE_HEIGHT;
    const oz = shooter.movement.z;
    const dx = Math.sin(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = Math.cos(yaw) * Math.cos(pitch);

    this.projectiles.push({
      id: this.nextProjectileId++,
      x: ox + dx * 1.2,
      y: oy + dy * 1.2,
      z: oz + dz * 1.2,
      vx: dx * weapon.projectileSpeed,
      vy: dy * weapon.projectileSpeed,
      vz: dz * weapon.projectileSpeed,
      ownerId: shooter.id,
      weapon,
    });
  }

  explodeProjectile(proj) {
    this.projectiles = this.projectiles.filter((p) => p !== proj);
    const owner = this.players.get(proj.ownerId);
    this.broadcast({ type: MSG.EXPLOSION, x: proj.x, y: proj.y, z: proj.z, radius: proj.weapon.splashRadius });

    for (const target of this.players.values()) {
      if (!target.alive) continue;
      if (owner && target.id === owner.id) continue;
      if (owner && target.team === owner.team) continue;
      const cx = target.movement.x;
      const cy = target.movement.y + PLAYER_EYE_HEIGHT * 0.6;
      const cz = target.movement.z;
      const dist = Math.hypot(cx - proj.x, cy - proj.y, cz - proj.z);
      if (dist >= proj.weapon.splashRadius) continue;

      const dirLen = dist || 1;
      const losT = nearestWorldHit(proj.x, proj.y, proj.z, (cx - proj.x) / dirLen, (cy - proj.y) / dirLen, (cz - proj.z) / dirLen, this.colliders, dirLen);
      if (losT < dirLen - 0.3) continue; // blocked by geometry

      const dmg = computeSplashDamage(proj.weapon, dist);
      if (dmg > 0 && owner) this.applyDamage(owner, target, dmg, proj.weapon.id);
    }
  }

  updateProjectiles(dt) {
    for (const proj of [...this.projectiles]) {
      proj.vy -= proj.weapon.projectileGravity * dt;
      const nx = proj.x + proj.vx * dt;
      const ny = proj.y + proj.vy * dt;
      const nz = proj.z + proj.vz * dt;

      if (ny <= 0) {
        proj.x = nx; proj.y = 0; proj.z = nz;
        this.explodeProjectile(proj);
        continue;
      }

      const dist = Math.hypot(nx - proj.x, ny - proj.y, nz - proj.z) || 0.0001;
      const dirX = (nx - proj.x) / dist;
      const dirY = (ny - proj.y) / dist;
      const dirZ = (nz - proj.z) / dist;
      const worldT = nearestWorldHit(proj.x, proj.y, proj.z, dirX, dirY, dirZ, this.colliders, dist);
      if (worldT < dist) {
        proj.x += dirX * worldT; proj.y += dirY * worldT; proj.z += dirZ * worldT;
        this.explodeProjectile(proj);
        continue;
      }

      let exploded = false;
      for (const target of this.players.values()) {
        if (!target.alive || target.id === proj.ownerId) continue;
        const d = Math.hypot(target.movement.x - nx, (target.movement.y + PLAYER_EYE_HEIGHT * 0.6) - ny, target.movement.z - nz);
        if (d <= PROJECTILE_HIT_RADIUS) {
          proj.x = nx; proj.y = ny; proj.z = nz;
          this.explodeProjectile(proj);
          exploded = true;
          break;
        }
      }
      if (exploded) continue;

      proj.x = nx; proj.y = ny; proj.z = nz;
    }
  }

  applyDamage(shooter, target, dmg, weaponId) {
    target.health -= dmg;
    if (target.health > 0) return;

    target.health = 0;
    target.die();
    shooter.kills += 1;
    this.score[shooter.team] += 1;

    const feedEntry = {
      killerName: shooter.name,
      killerTeam: shooter.team,
      victimName: target.name,
      victimTeam: target.team,
      weapon: weaponId,
      time: Date.now(),
    };
    this.killFeed.push(feedEntry);
    if (this.killFeed.length > 30) this.killFeed.shift();

    this.broadcast({ type: MSG.KILL, ...feedEntry });
    this.broadcast({ type: MSG.SCORE, score: this.score });

    if (!this.matchOver && this.score[shooter.team] >= KILL_LIMIT) {
      this.matchOver = true;
      this.matchRestartTimer = MATCH_RESTART_DELAY;
      this.broadcast({ type: MSG.MATCH_OVER, winner: shooter.team, score: this.score });
    }
  }

  updatePlayerTimers(player, dt) {
    if (player.fireCooldown > 0) player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    if (player.reloading) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) {
        player.ammo[player.weapon] = WEAPONS[player.weapon].magazineSize;
        player.reloading = false;
      }
    }
  }

  updateRespawns(dt) {
    for (const player of this.players.values()) {
      if (player.alive) continue;
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) player.respawn();
    }
  }

  updateMatchRestart(dt) {
    if (!this.matchOver) return;
    this.matchRestartTimer -= dt;
    if (this.matchRestartTimer <= 0) this.resetMatch();
  }

  resetMatch() {
    this.matchOver = false;
    this.score = { red: 0, blue: 0 };
    this.killFeed = [];
    this.projectiles = [];
    for (const player of this.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.respawn();
    }
    this.broadcast({ type: MSG.SCORE, score: this.score });
  }

  tick() {
    const dt = TICK_DT;

    for (const player of this.players.values()) {
      this.updatePlayerTimers(player, dt);
      while (player.inputQueue.length) {
        const input = player.inputQueue.shift();
        if (player.alive) {
          player.movement = simulateMovementTick(player.movement, input, dt, this.colliders, ARENA_HALF_SIZE);
        }
        player.pitch = input.pitch;
        player.lastProcessedSeq = input.seq;
      }
    }

    this.updateProjectiles(dt);
    this.updateRespawns(dt);
    this.updateMatchRestart(dt);

    this.snapshotAccum += dt;
    const snapshotInterval = 1 / SNAPSHOT_RATE;
    if (this.snapshotAccum >= snapshotInterval) {
      this.snapshotAccum -= snapshotInterval;
      this.broadcastSnapshot();
    }
  }

  broadcastSnapshot() {
    const players = [...this.players.values()].map((p) => p.serialize());
    const projectiles = this.projectiles.map((p) => ({
      id: p.id,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.z * 100) / 100,
    }));

    for (const player of this.players.values()) {
      this.sendTo(player, {
        type: MSG.SNAPSHOT,
        players,
        projectiles,
        yourSeq: player.lastProcessedSeq,
        score: this.score,
        matchOver: this.matchOver,
      });
    }
  }

  sendTo(player, obj) {
    if (player.socket.readyState === player.socket.OPEN) {
      player.socket.send(JSON.stringify(obj));
    }
  }

  broadcast(obj, excludeId) {
    const raw = JSON.stringify(obj);
    for (const player of this.players.values()) {
      if (player.id === excludeId) continue;
      if (player.socket.readyState === player.socket.OPEN) player.socket.send(raw);
    }
  }
}
