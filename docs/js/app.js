/* LIFE OS — standalone version. All data lives in this device's localStorage. */

const $ = (id) => document.getElementById(id);
let lastLevel = null;

// ── storage ──────────────────────────────────────────────────────────────────

const KEY = "lifeos";

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.routines && d.tasks && d.goals) return d;
  } catch (e) {}
  return { routines: [], tasks: [], goals: [] };
}

let db = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── derived stats (mirrors jarvis/life.py) ───────────────────────────────────

function streak(history) {
  let day = new Date();
  if (!history[dateStr(day)]) day.setDate(day.getDate() - 1);
  let count = 0;
  while (history[dateStr(day)]) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

function goalProgress(g) {
  const ms = g.milestones || [];
  if (ms.length) return Math.round((ms.filter((m) => m.done).length / ms.length) * 100);
  return g.progress || 0;
}

const RANKS = ["Rookie", "Apprentice", "Operator", "Specialist", "Agent", "Veteran", "Elite", "Commander", "Master", "Legend"];

function xpStats() {
  const routineChecks = db.routines.reduce((n, r) => n + Object.values(r.history || {}).filter(Boolean).length, 0);
  const tasksDone = db.tasks.filter((t) => t.done).length;
  const msDone = db.goals.reduce((n, g) => n + (g.milestones || []).filter((m) => m.done).length, 0);
  const goalsDone = db.goals.filter((g) => goalProgress(g) >= 100).length;

  const xp = routineChecks * 10 + tasksDone * 15 + msDone * 25 + goalsDone * 100;
  const level = 1 + Math.floor(Math.sqrt(xp / 40));
  const floorXp = 40 * (level - 1) ** 2;
  const nextXp = 40 * level ** 2;
  const bestStreak = db.routines.reduce((b, r) => Math.max(b, streak(r.history || {})), 0);

  return {
    xp,
    level,
    rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
    level_progress: Math.round(((xp - floorXp) / Math.max(nextXp - floorXp, 1)) * 100),
    xp_to_next: nextXp - xp,
    best_streak: bestStreak,
    tasks_done: tasksDone,
  };
}

// ── render ───────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function render() {
  save();
  const t = today();
  const stats = xpStats();

  const routines = [...db.routines]
    .map((r) => ({ ...r, done_today: !!(r.history || {})[t], streak: streak(r.history || {}) }))
    .sort((a, b) => {
      const order = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
      return (order[a.time_of_day] ?? 3) - (order[b.time_of_day] ?? 3);
    });

  const prio = { high: 0, medium: 1, low: 2 };
  const tasks = [...db.tasks].sort(
    (a, b) => (a.done - b.done) || ((prio[a.priority] ?? 1) - (prio[b.priority] ?? 1)) || String(a.due || "9999").localeCompare(String(b.due || "9999"))
  );

  const goals = [...db.goals]
    .map((g) => ({ ...g, progress: goalProgress(g) }))
    .sort((a, b) => (a.progress >= 100) - (b.progress >= 100) || String(a.target_date || "9999").localeCompare(String(b.target_date || "9999")));

  const doneToday = routines.filter((r) => r.done_today).length;

  $("level").textContent = stats.level;
  $("rank").textContent = stats.rank;
  $("xp").textContent = stats.xp;
  $("xp-next").textContent = stats.xp_to_next;
  $("xp-fill").style.width = stats.level_progress + "%";
  $("stat-streak").textContent = stats.best_streak;
  $("stat-today").textContent = `${doneToday}/${routines.length}`;
  $("stat-goals").textContent = goals.filter((g) => g.progress < 100).length;
  $("stat-missions").textContent = stats.tasks_done;

  if (lastLevel !== null && stats.level > lastLevel) {
    toast(`⬆ LEVEL UP — LVL ${stats.level} ${stats.rank.toUpperCase()}`);
  }
  lastLevel = stats.level;

  renderRoutines(routines, doneToday);
  renderTasks(tasks);
  renderGoals(goals);
}

function renderRoutines(routines, doneToday) {
  const list = $("routines-list");
  $("routines-count").textContent = `${doneToday}/${routines.length}`;
  if (!routines.length) {
    list.innerHTML = `<div class="empty-msg">No routines yet — add your first habit below.</div>`;
    return;
  }
  list.innerHTML = routines
    .map(
      (r) => `
    <div class="item ${r.done_today ? "done" : ""}">
      <button class="check ${r.done_today ? "on" : ""}" data-act="check-routine" data-id="${r.id}" title="Mark done"></button>
      <div class="item-body">
        <div class="item-title">${esc(r.icon)} ${esc(r.title)}</div>
        <div class="item-meta">
          <span class="tod">${esc(r.time_of_day)}</span>
          ${r.streak > 0 ? `<span class="streak">🔥 ${r.streak} day${r.streak > 1 ? "s" : ""}</span>` : ""}
        </div>
      </div>
      <button class="del-btn" data-act="del-routine" data-id="${r.id}" title="Delete">✕</button>
    </div>`
    )
    .join("");
}

function renderTasks(tasks) {
  const list = $("tasks-list");
  $("tasks-count").textContent = `${tasks.filter((t) => !t.done).length} open`;
  if (!tasks.length) {
    list.innerHTML = `<div class="empty-msg">Mission board clear. Add something below.</div>`;
    return;
  }
  list.innerHTML = tasks
    .map(
      (t) => `
    <div class="item ${t.done ? "done" : ""}">
      <button class="check ${t.done ? "on" : ""}" data-act="check-task" data-id="${t.id}" title="Complete"></button>
      <span class="prio ${esc(t.priority)}" title="${esc(t.priority)} priority"></span>
      <div class="item-body">
        <div class="item-title">${esc(t.title)}</div>
        ${t.due ? `<div class="item-meta"><span>📅 ${esc(t.due)}</span></div>` : ""}
      </div>
      <button class="del-btn" data-act="del-task" data-id="${t.id}" title="Delete">✕</button>
    </div>`
    )
    .join("");
}

function renderGoals(goals) {
  const list = $("goals-list");
  $("goals-count").textContent = `${goals.filter((g) => g.progress < 100).length} active`;
  if (!goals.length) {
    list.innerHTML = `<div class="empty-msg">Dream big — add your first goal below.</div>`;
    return;
  }
  list.innerHTML = goals
    .map((g) => {
      const ms = (g.milestones || [])
        .map(
          (m) => `
        <div class="milestone ${m.done ? "done" : ""}">
          <button class="check ${m.done ? "on" : ""}" data-act="check-ms" data-goal="${g.id}" data-id="${m.id}"></button>
          <span>${esc(m.title)}</span>
        </div>`
        )
        .join("");
      const manual = !(g.milestones || []).length
        ? `<div class="prog-btns">
             <button data-act="prog" data-id="${g.id}" data-delta="-10">−10%</button>
             <button data-act="prog" data-id="${g.id}" data-delta="10">+10%</button>
             <span class="prog-hint">or add milestones to auto-track</span>
           </div>`
        : "";
      return `
    <div class="item goal ${g.progress >= 100 ? "complete" : ""}">
      <div class="goal-head">
        <span class="goal-title">${g.progress >= 100 ? "🏆 " : ""}${esc(g.title)}</span>
        <span class="goal-pct">${g.progress}%</span>
        <button class="del-btn" data-act="del-goal" data-id="${g.id}" title="Delete">✕</button>
      </div>
      ${g.why ? `<div class="goal-why">“${esc(g.why)}”</div>` : ""}
      ${g.target_date ? `<div class="goal-target">TARGET: ${esc(g.target_date)}</div>` : ""}
      <div class="goal-bar"><div class="goal-fill" style="width:${g.progress}%"></div></div>
      ${ms ? `<div class="milestones">${ms}</div>` : ""}
      ${manual}
      <form class="ms-form" data-goal="${g.id}">
        <input type="text" placeholder="Add milestone…" autocomplete="off">
        <button type="submit">+</button>
      </form>
    </div>`;
    })
    .join("");
}

// ── effects ──────────────────────────────────────────────────────────────────

function xpFloat(x, y, text) {
  const el = document.createElement("div");
  el.className = "xp-float";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ── actions ──────────────────────────────────────────────────────────────────

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  const wasOff = !btn.classList.contains("on");
  const rect = btn.getBoundingClientRect();
  const t = today();

  if (act === "check-routine") {
    const r = db.routines.find((r) => r.id === id);
    if (!r) return;
    r.history = r.history || {};
    if (r.history[t]) delete r.history[t];
    else r.history[t] = true;
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+10 XP");
  } else if (act === "check-task") {
    const task = db.tasks.find((x) => x.id === id);
    if (!task) return;
    task.done = !task.done;
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+15 XP");
  } else if (act === "check-ms") {
    const g = db.goals.find((x) => x.id === btn.dataset.goal);
    const m = g && (g.milestones || []).find((x) => x.id === id);
    if (!m) return;
    m.done = !m.done;
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+25 XP");
  } else if (act === "prog") {
    const g = db.goals.find((x) => x.id === id);
    if (!g) return;
    g.progress = Math.max(0, Math.min(100, (g.progress || 0) + parseInt(btn.dataset.delta)));
  } else if (act === "del-routine") {
    if (!confirm("Delete this routine (and its streak history)?")) return;
    db.routines = db.routines.filter((r) => r.id !== id);
  } else if (act === "del-task") {
    db.tasks = db.tasks.filter((x) => x.id !== id);
  } else if (act === "del-goal") {
    if (!confirm("Delete this goal?")) return;
    db.goals = db.goals.filter((g) => g.id !== id);
  } else {
    return;
  }
  render();
});

// ── add forms ────────────────────────────────────────────────────────────────

$("routine-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("routine-title").value.trim();
  if (!title) return;
  db.routines.push({
    id: uid(),
    title,
    icon: $("routine-icon").value.trim() || "✦",
    time_of_day: $("routine-time").value,
    history: {},
  });
  $("routine-title").value = "";
  $("routine-icon").value = "";
  render();
});

$("task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("task-title").value.trim();
  if (!title) return;
  db.tasks.push({ id: uid(), title, priority: $("task-priority").value, due: null, done: false });
  $("task-title").value = "";
  render();
});

$("goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("goal-title").value.trim();
  if (!title) return;
  const why = prompt("Why does this goal matter to you? (optional)") || "";
  db.goals.push({ id: uid(), title, why, target_date: null, progress: 0, milestones: [] });
  $("goal-title").value = "";
  render();
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest(".ms-form");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input");
  const title = input.value.trim();
  if (!title) return;
  const g = db.goals.find((x) => x.id === form.dataset.goal);
  if (!g) return;
  (g.milestones = g.milestones || []).push({ id: uid(), title, done: false });
  render();
});

// ── mobile tabs ──────────────────────────────────────────────────────────────

document.querySelectorAll(".tab[data-panel]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(tab.dataset.panel).classList.add("active");
  });
});
document.getElementById("panel-routines").classList.add("active");

// ── PWA ──────────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ── boot ─────────────────────────────────────────────────────────────────────

render();
