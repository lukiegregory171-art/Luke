/* LIFE OS — standalone version. All data lives in this device's localStorage. */

const $ = (id) => document.getElementById(id);
let lastLevel = null;
let lastUnlocked = null;

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

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function today() {
  return dateStr(new Date());
}

// ── derived stats ────────────────────────────────────────────────────────────

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
    xp, level,
    rank: RANKS[Math.min(level - 1, RANKS.length - 1)],
    level_progress: Math.round(((xp - floorXp) / Math.max(nextXp - floorXp, 1)) * 100),
    xp_to_next: nextXp - xp,
    best_streak: bestStreak,
    tasks_done: tasksDone,
    routine_checks: routineChecks,
    ms_done: msDone,
    goals_done: goalsDone,
  };
}

// ── quotes ───────────────────────────────────────────────────────────────────

const QUOTES = [
  ["Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"],
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
  ["A journey of a thousand miles begins with a single step.", "Lao Tzu"],
  ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
  ["Success is the sum of small efforts, repeated day in and day out.", "Robert Collier"],
  ["The secret of getting ahead is getting started.", "Mark Twain"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Don't count the days. Make the days count.", "Muhammad Ali"],
  ["Motivation gets you going. Habit keeps you growing.", "John C. Maxwell"],
  ["Small daily improvements are the key to staggering long-term results.", "Robin Sharma"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese proverb"],
  ["Your future is created by what you do today, not tomorrow.", "Robert Kiyosaki"],
  ["Dream big. Start small. Act now.", "Robin Sharma"],
  ["Fall seven times, stand up eight.", "Japanese proverb"],
];

function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return `${part} — ${date}`;
}

// ── achievements ─────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { icon: "🌱", name: "First Step",      desc: "Complete a routine",      test: (s) => s.routine_checks >= 1 },
  { icon: "🔥", name: "On Fire",         desc: "3-day streak",            test: (s) => s.best_streak >= 3 },
  { icon: "⚔️", name: "Unstoppable",     desc: "7-day streak",            test: (s) => s.best_streak >= 7 },
  { icon: "👑", name: "Iron Will",       desc: "30-day streak",           test: (s) => s.best_streak >= 30 },
  { icon: "✅", name: "Mission Ready",   desc: "Complete a mission",      test: (s) => s.tasks_done >= 1 },
  { icon: "⚡", name: "Operator",        desc: "10 missions done",        test: (s) => s.tasks_done >= 10 },
  { icon: "🤖", name: "Mission Machine", desc: "50 missions done",        test: (s) => s.tasks_done >= 50 },
  { icon: "💭", name: "Dreamer",         desc: "Create a goal",           test: (s, d) => d.goals.length >= 1 },
  { icon: "🪜", name: "Step by Step",    desc: "10 milestones done",      test: (s) => s.ms_done >= 10 },
  { icon: "🏆", name: "Goal Crusher",    desc: "Complete a goal",         test: (s) => s.goals_done >= 1 },
  { icon: "🥉", name: "Level 5",         desc: "Reach level 5",           test: (s) => s.level >= 5 },
  { icon: "🥇", name: "Level 10",        desc: "Reach level 10 — Legend", test: (s) => s.level >= 10 },
];

// ── render ───────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function fmtDate(iso) {
  try {
    const [y, m, dd] = iso.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch (e) { return iso; }
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
    (a, b) => (a.done - b.done) || String(a.due || "9999").localeCompare(String(b.due || "9999")) || ((prio[a.priority] ?? 1) - (prio[b.priority] ?? 1))
  );

  const goals = [...db.goals]
    .map((g) => ({ ...g, progress: goalProgress(g) }))
    .sort((a, b) => (a.progress >= 100) - (b.progress >= 100) || String(a.target_date || "9999").localeCompare(String(b.target_date || "9999")));

  const doneToday = routines.filter((r) => r.done_today).length;

  // header + quote
  $("greeting").textContent = greeting();
  const [q, by] = QUOTES[dayOfYear() % QUOTES.length];
  $("quote-bar").innerHTML = `“${esc(q)}” — <b>${esc(by)}</b>`;

  $("level").textContent = stats.level;
  $("rank").textContent = stats.rank;
  $("xp").textContent = stats.xp;
  $("xp-next").textContent = stats.xp_to_next;
  $("xp-fill").style.width = stats.level_progress + "%";

  // stats strip
  $("stat-today").textContent = `${doneToday}/${routines.length}`;
  const frac = routines.length ? doneToday / routines.length : 0;
  $("ring-val").style.strokeDashoffset = (119.4 * (1 - frac)).toFixed(1);
  $("stat-streak").textContent = stats.best_streak;
  $("stat-goals").textContent = goals.filter((g) => g.progress < 100).length;
  $("stat-missions").textContent = stats.tasks_done;

  if (lastLevel !== null && stats.level > lastLevel) {
    toast(`⬆ LEVEL UP — LVL ${stats.level} ${stats.rank.toUpperCase()}`);
    confetti();
  }
  lastLevel = stats.level;

  // achievement unlock toast
  const unlocked = ACHIEVEMENTS.filter((a) => a.test(stats, db)).length;
  if (lastUnlocked !== null && unlocked > lastUnlocked) {
    const newest = ACHIEVEMENTS.filter((a) => a.test(stats, db)).pop();
    toast(`🏅 ACHIEVEMENT — ${newest.name.toUpperCase()}`, "gold");
  }
  lastUnlocked = unlocked;

  renderRoutines(routines, doneToday);
  renderTasks(tasks);
  renderGoals(goals);
  renderStats(stats, unlocked);
}

function weekGrid(history, doneToday) {
  let cells = "";
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const on = history[dateStr(d)];
    const cls = on ? "on" : i === 0 ? "today-pending" : "";
    cells += `<i class="${cls}" title="${dateStr(d)}"></i>`;
  }
  return `<span class="week-grid" title="Last 7 days">${cells}</span>`;
}

function renderRoutines(routines, doneToday) {
  const list = $("routines-list");
  $("routines-count").textContent = `${doneToday}/${routines.length} today`;
  if (!routines.length) {
    list.innerHTML = `<div class="empty-msg"><span class="em-icon">🌱</span>No routines yet.<br>Add your first daily habit below — small steps win.</div>`;
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
          ${weekGrid(r.history || {}, r.done_today)}
          ${r.streak > 0 ? `<span class="streak">🔥 ${r.streak}d</span>` : ""}
        </div>
      </div>
      <button class="del-btn" data-act="del-routine" data-id="${r.id}" title="Delete">✕</button>
    </div>`
    )
    .join("");
}

function dueBadge(t) {
  if (!t.due || t.done) return "";
  const tdy = today();
  if (t.due < tdy) return `<span class="due-badge overdue">⚠ OVERDUE · ${fmtDate(t.due)}</span>`;
  if (t.due === tdy) return `<span class="due-badge due-today">📅 Due today</span>`;
  return `<span class="due-badge">📅 ${fmtDate(t.due)}</span>`;
}

function renderTasks(tasks) {
  const list = $("tasks-list");
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && t.due < today()).length;
  $("tasks-count").textContent = overdue ? `${open.length} open · ${overdue} overdue` : `${open.length} open`;
  if (!tasks.length) {
    list.innerHTML = `<div class="empty-msg"><span class="em-icon">⚡</span>Mission board clear.<br>Add what needs doing — get it out of your head.</div>`;
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
        ${t.due && !t.done ? `<div class="item-meta">${dueBadge(t)}</div>` : ""}
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
    list.innerHTML = `<div class="empty-msg"><span class="em-icon">🚀</span>Dream big.<br>Add a goal, then break it into milestones you can actually hit.</div>`;
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
      ${g.target_date ? `<div class="goal-target">TARGET: ${fmtDate(g.target_date)}</div>` : ""}
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

function renderStats(stats, unlocked) {
  $("stats-sub").textContent = `${stats.xp} XP lifetime`;

  // heatmap: last 8 weeks, aligned so columns are weeks ending today
  const counts = {};
  db.routines.forEach((r) => {
    Object.keys(r.history || {}).forEach((d) => {
      if (r.history[d]) counts[d] = (counts[d] || 0) + 1;
    });
  });
  db.tasks.forEach((t) => {
    if (t.done && t.completed_on) counts[t.completed_on] = (counts[t.completed_on] || 0) + 1;
  });
  let cells = "";
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 55 - end.getDay()); // back to a Sunday, ~8 weeks
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const c = counts[dateStr(d)] || 0;
    const lvl = c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : 3;
    cells += `<i class="h${lvl}" title="${dateStr(d)}: ${c} completed"></i>`;
  }
  $("heatmap").innerHTML = cells;

  // achievements
  $("ach-count").textContent = `· ${unlocked}/${ACHIEVEMENTS.length}`;
  $("achievements").innerHTML = ACHIEVEMENTS.map((a) => {
    const got = a.test(stats, db);
    return `
    <div class="ach ${got ? "unlocked" : "locked"}">
      <span class="ach-icon">${a.icon}</span>
      <span><span class="ach-name">${a.name}</span><div class="ach-desc">${a.desc}</div></span>
    </div>`;
  }).join("");
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
function toast(msg, kind) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (kind === "gold" ? " gold" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

const CONF_COLORS = ["#00d4ff", "#00ff9d", "#ffb13d", "#9d7bff", "#ff4d6b", "#ffffff"];
function confetti() {
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = CONF_COLORS[i % CONF_COLORS.length];
    el.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    el.style.animationDelay = Math.random() * 0.4 + "s";
    el.style.width = 6 + Math.random() * 6 + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
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
    if (wasOff) {
      xpFloat(rect.left, rect.top - 8, "+10 XP");
      const s = streak(r.history);
      if (s > 0 && s % 7 === 0) toast(`🔥 ${s}-DAY STREAK — ${r.title.toUpperCase()}`, "gold");
    }
  } else if (act === "check-task") {
    const task = db.tasks.find((x) => x.id === id);
    if (!task) return;
    task.done = !task.done;
    task.completed_on = task.done ? t : null;
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+15 XP");
  } else if (act === "check-ms") {
    const g = db.goals.find((x) => x.id === btn.dataset.goal);
    const m = g && (g.milestones || []).find((x) => x.id === id);
    if (!m) return;
    const before = goalProgress(g);
    m.done = !m.done;
    if (wasOff) {
      xpFloat(rect.left, rect.top - 8, "+25 XP");
      if (before < 100 && goalProgress(g) >= 100) {
        toast(`🏆 GOAL COMPLETE — ${g.title.toUpperCase()}`, "gold");
        confetti();
      }
    }
  } else if (act === "prog") {
    const g = db.goals.find((x) => x.id === id);
    if (!g) return;
    const before = g.progress || 0;
    g.progress = Math.max(0, Math.min(100, before + parseInt(btn.dataset.delta)));
    if (before < 100 && g.progress >= 100) {
      toast(`🏆 GOAL COMPLETE — ${g.title.toUpperCase()}`, "gold");
      confetti();
    }
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
    id: uid(), title,
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
  db.tasks.push({
    id: uid(), title,
    priority: $("task-priority").value,
    due: $("task-due").value || null,
    done: false,
  });
  $("task-title").value = "";
  $("task-due").value = "";
  render();
});

$("goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = $("goal-title").value.trim();
  if (!title) return;
  const why = prompt("Why does this goal matter to you? (optional — it shows under the goal to keep you going)") || "";
  db.goals.push({
    id: uid(), title, why,
    target_date: $("goal-date").value || null,
    progress: 0, milestones: [],
  });
  $("goal-title").value = "";
  $("goal-date").value = "";
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

// ── backup / restore ─────────────────────────────────────────────────────────

$("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lifeos-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("⬇ BACKUP SAVED");
});

$("import-btn").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.routines) || !Array.isArray(d.tasks) || !Array.isArray(d.goals)) {
        throw new Error("bad format");
      }
      if (!confirm("Replace everything on this device with the backup?")) return;
      db = d;
      lastLevel = null;
      lastUnlocked = null;
      render();
      toast("⬆ BACKUP RESTORED");
    } catch (err) {
      toast("⚠ NOT A VALID LIFE OS BACKUP");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
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
// re-render at midnight rollover / when returning to the app
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
