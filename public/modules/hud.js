const TEAM_LABEL = { red: 'RED', blue: 'BLUE' };

export class Hud {
  constructor() {
    this.el = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      ammoText: document.getElementById('ammo-text'),
      weaponName: document.getElementById('weapon-name'),
      reloadText: document.getElementById('reload-text'),
      dashFill: document.getElementById('dash-fill'),
      killFeed: document.getElementById('kill-feed'),
      scoreboard: document.getElementById('scoreboard'),
      scoreboardRed: document.getElementById('scoreboard-red'),
      scoreboardBlue: document.getElementById('scoreboard-blue'),
      scoreBannerRed: document.getElementById('score-red'),
      scoreBannerBlue: document.getElementById('score-blue'),
      hitMarker: document.getElementById('hit-marker'),
      damageFlash: document.getElementById('damage-flash'),
      respawnOverlay: document.getElementById('respawn-overlay'),
      respawnText: document.getElementById('respawn-text'),
      matchOverOverlay: document.getElementById('match-over-overlay'),
      matchOverText: document.getElementById('match-over-text'),
      crosshair: document.getElementById('crosshair'),
    };
    this._hitMarkerTimer = 0;
    this._damageFlashTimer = 0;
  }

  updateHealth(hp, maxHp) {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    this.el.healthFill.style.width = `${pct}%`;
    this.el.healthFill.style.background = pct > 50 ? '#4caf50' : pct > 25 ? '#e0a72d' : '#e04b3c';
    this.el.healthText.textContent = `${Math.round(hp)}`;
  }

  updateWeapon(name, ammo, magazineSize, reloading) {
    this.el.weaponName.textContent = name;
    this.el.ammoText.textContent = `${ammo} / ${magazineSize}`;
    this.el.reloadText.style.display = reloading ? 'block' : 'none';
  }

  updateDash(cooldown, maxCooldown) {
    const pct = Math.max(0, Math.min(1, 1 - cooldown / maxCooldown));
    this.el.dashFill.style.width = `${pct * 100}%`;
  }

  addKillFeed(entry) {
    const row = document.createElement('div');
    row.className = 'kill-row';
    const killerColor = entry.killerTeam === 'red' ? '#ff6b5e' : '#5eaaff';
    const victimColor = entry.victimTeam === 'red' ? '#ff6b5e' : '#5eaaff';
    row.innerHTML = `<span style="color:${killerColor}">${escapeHtml(entry.killerName)}</span>
      <span class="kill-weapon">${weaponIcon(entry.weapon)}</span>
      <span style="color:${victimColor}">${escapeHtml(entry.victimName)}</span>`;
    this.el.killFeed.appendChild(row);
    while (this.el.killFeed.children.length > 6) this.el.killFeed.removeChild(this.el.killFeed.firstChild);
    setTimeout(() => row.remove(), 6000);
  }

  setScoreboardVisible(visible) {
    this.el.scoreboard.style.display = visible ? 'flex' : 'none';
  }

  updateScore(score) {
    this.el.scoreBannerRed.textContent = score.red;
    this.el.scoreBannerBlue.textContent = score.blue;
  }

  updateScoreboard(players, score) {
    const red = players.filter((p) => p.team === 'red').sort((a, b) => b.kills - a.kills);
    const blue = players.filter((p) => p.team === 'blue').sort((a, b) => b.kills - a.kills);
    this.el.scoreboardRed.innerHTML = `<h3>RED — ${score.red}</h3>` + red.map(rowHtml).join('');
    this.el.scoreboardBlue.innerHTML = `<h3>BLUE — ${score.blue}</h3>` + blue.map(rowHtml).join('');
  }

  flashHitMarker() {
    this.el.hitMarker.style.opacity = '1';
    this._hitMarkerTimer = 0.25;
  }

  flashDamage() {
    this.el.damageFlash.style.opacity = '0.45';
    this._damageFlashTimer = 0.4;
  }

  showRespawn(killerName, seconds) {
    this.el.respawnOverlay.style.display = 'flex';
    this.el.respawnText.textContent = killerName
      ? `Killed by ${killerName} — respawning in ${seconds}s`
      : `Respawning in ${seconds}s`;
  }

  hideRespawn() {
    this.el.respawnOverlay.style.display = 'none';
  }

  showMatchOver(winner, restartIn) {
    this.el.matchOverOverlay.style.display = 'flex';
    this.el.matchOverText.textContent = `${TEAM_LABEL[winner]} TEAM WINS — new match in ${restartIn}s`;
  }

  hideMatchOver() {
    this.el.matchOverOverlay.style.display = 'none';
  }

  setCrosshairSpread(spreadPx) {
    this.el.crosshair.style.setProperty('--spread', `${spreadPx}px`);
  }

  tick(dt) {
    if (this._hitMarkerTimer > 0) {
      this._hitMarkerTimer -= dt;
      if (this._hitMarkerTimer <= 0) this.el.hitMarker.style.opacity = '0';
    }
    if (this._damageFlashTimer > 0) {
      this._damageFlashTimer -= dt;
      const t = Math.max(0, this._damageFlashTimer / 0.4);
      this.el.damageFlash.style.opacity = `${0.45 * t}`;
    }
  }
}

function rowHtml(p) {
  const status = p.alive ? '' : ' (dead)';
  return `<div class="scoreboard-row"><span>${escapeHtml(p.name)}${status}</span><span>${p.kills}/${p.deaths}</span></div>`;
}

function weaponIcon(weapon) {
  return { ar: '»', shotgun: '»»', sniper: '——', rocket: '((*))' }[weapon] || '×';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
