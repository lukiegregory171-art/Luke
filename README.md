# Rivals-Style Multiplayer FPS

A browser-based multiplayer first-person shooter inspired by **Rivals on Roblox** —
blocky low-poly characters, team deathmatch, and fast movement. Three.js on the
client, an authoritative Node.js + `ws` WebSocket server, no build tools.

## Quick start

```bash
npm install
npm start
```

Open **http://localhost:3000** in two or more browser windows to play. Red vs
blue teams are auto-balanced; first team to **25 kills** wins.

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click to lock pointer) |
| Shift (hold) | Sprint |
| Shift (tap) | Dash (4s cooldown) |
| Space | Jump / double-jump |
| Left click | Fire |
| 1 / 2 / 3 / 4 | Assault rifle / Shotgun / Sniper / Rocket launcher |
| R | Reload |
| Tab (hold) | Scoreboard |

## How it works

- **Server-authoritative**: all movement, hit detection, damage, and scoring are
  simulated on the server at 60 Hz; clients only send inputs.
- **Client-side prediction**: your own movement runs the *same* shared simulation
  locally and reconciles against server acks, so it feels instant.
- **Entity interpolation**: remote players render ~100 ms in the past, blended
  between snapshots (20 Hz) to hide network jitter.
- **Weapons**: hitscan (AR, shotgun, sniper) with per-weapon spread and distance
  falloff, plus a projectile rocket launcher with splash damage and
  line-of-sight checks.
- **Arena**: one symmetrical map — central tower with ramps, mirrored bunkers,
  crates, and side lanes — defined once in `mapData.js` and used by both the
  renderer and the physics.

## Game project layout

```
server/index.js              HTTP static server + boot
server/gameServer.js         Authoritative tick loop, hit detection, TDM scoring
server/player.js             Per-player state, spawning, team balance
public/index.html            HUD markup + menu
public/game.js               Client entry: prediction, camera, net handlers
public/modules/renderer.js   Scene, arena meshes, blocky characters
public/modules/*.js          Input, network, HUD, effects, weapon models…
public/modules/shared/*.js   Constants, weapons, map, movement — shared by
                             client AND server so prediction matches authority
```

---

# J.A.R.V.I.S. + LIFE OS

Your personal AI assistant with a built-in **Life OS** dashboard — daily routines with
streaks, a mission (task) board, and long-term goals with milestones, all gamified with
XP and levels. The AI sees everything on your dashboard and can update it for you.

## Quick start

```bash
pip install -r requirements.txt
cp .env.example .env        # add your GROQ_API_KEY (free) or ANTHROPIC_API_KEY
python app.py
```

Then open:

- **http://localhost:5000** — talk to J.A.R.V.I.S.
- **http://localhost:5000/life** — the LIFE OS dashboard

## Use it on your phone

The server already listens on your whole network (`0.0.0.0`), so:

1. Make sure your phone is on the **same Wi-Fi** as your PC.
2. Find your PC's local IP — run `ipconfig` (Windows) or `ip addr` (Linux/Mac),
   look for something like `192.168.x.x`.
3. On your phone open `http://192.168.x.x:5000/life`.
4. **Install it like a real app:** in Chrome tap ⋮ → *Add to Home screen*
   (Safari: Share → *Add to Home Screen*). It's a PWA — it gets its own icon and
   opens full-screen.

To use it from anywhere (not just home Wi-Fi), deploy it to a free host like
[Render](https://render.com) or [Railway](https://railway.app), or tunnel with
[ngrok](https://ngrok.com): `ngrok http 5000`.

## What the AI can do with your Life OS

Just talk to JARVIS naturally:

- *"I finished my workout"* → checks off the routine, keeps your streak alive
- *"Add a routine to read every evening"* → creates it
- *"Remind me to book the dentist, high priority"* → adds a mission
- *"My goal is to run a half marathon by December"* → creates the goal and can
  break it into milestones with you
- *"How am I doing?"* → full overview: streaks, missions, goal progress, level

## XP system

| Action                  | XP   |
|-------------------------|------|
| Routine done (per day)  | +10  |
| Mission completed       | +15  |
| Milestone completed     | +25  |
| Goal reaching 100%      | +100 |

Levels rise on a curve, with ranks from **Rookie** up to **Legend**.

## Project layout

```
app.py                  Flask server + REST API
jarvis/agent.py         AI agent (Claude or Groq) + tool definitions
jarvis/tools.py         Tool implementations + dispatcher
jarvis/life.py          Life OS: routines, tasks, goals, streaks, XP
templates/index.html    J.A.R.V.I.S. chat HUD
templates/life.html     LIFE OS dashboard
static/                 CSS, JS, PWA manifest, service worker, icons
data/                   Your data (JSON, gitignored)
```
