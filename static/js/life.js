/* LIFE OS dashboard */

const $ = (id) => document.getElementById(id);
let state = null;
let lastLevel = null;

// ── api helpers ──────────────────────────────────────────────────────────────

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

async function refresh() {
  try {
    state = await api("/api/life");
    render();
  } catch (e) {
    toast("OFFLINE — CAN'T REACH SERVER");
  }
}

// ── render ───────────────────────────────────────────────────────────────────

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function render() {
  const { routines, tasks, goals, stats } = state;

  // header / stats
  $("level").textContent = stats.level;
  $("rank").textContent = stats.rank;
  $("xp").textContent = stats.xp;
  $("xp-next").textContent = stats.xp_to_next;
  $("xp-fill").style.width = stats.level_progress + "%";
  $("stat-streak").textContent = stats.best_streak;
  $("stat-today").textContent = state.routines_done_today;
  $("stat-goals").textContent = goals.filter((g) => g.progress < 100).length;
  $("stat-missions").textContent = stats.tasks_done;

  if (lastLevel !== null && stats.level > lastLevel) {
    toast(`⬆ LEVEL UP — LVL ${stats.level} ${stats.rank.toUpperCase()}`);
  }
  lastLevel = stats.level;

  renderRoutines(routines);
  renderTasks(tasks);
  renderGoals(goals);
}

function renderRoutines(routines) {
  const list = $("routines-list");
  $("routines-count").textContent = state.routines_done_today;
  if (!routines.length) {
    list.innerHTML = `<div class="empty-msg">No routines yet — add your first habit below.</div>`;
    return;
  }
  list.innerHTML = routines
    .map(
      (r) => `
    <div class="item ${r.done_today ? "done" : ""}" data-id="${r.id}">
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
  const open = tasks.filter((t) => !t.done);
  $("tasks-count").textContent = `${open.length} open`;
  if (!tasks.length) {
    list.innerHTML = `<div class="empty-msg">Mission board clear. Add something below.</div>`;
    return;
  }
  list.innerHTML = tasks
    .map(
      (t) => `
    <div class="item ${t.done ? "done" : ""}" data-id="${t.id}">
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
    <div class="item goal ${g.progress >= 100 ? "complete" : ""}" data-id="${g.id}">
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

// ── actions (event delegation) ───────────────────────────────────────────────

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  const wasOff = !btn.classList.contains("on");
  const rect = btn.getBoundingClientRect();

  if (act === "check-routine") {
    await api(`/api/life/routine/${id}/check`, "POST");
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+10 XP");
  } else if (act === "check-task") {
    await api(`/api/life/task/${id}/toggle`, "POST");
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+15 XP");
  } else if (act === "check-ms") {
    await api(`/api/life/goal/${btn.dataset.goal}/milestone/${id}/toggle`, "POST");
    if (wasOff) xpFloat(rect.left, rect.top - 8, "+25 XP");
  } else if (act === "prog") {
    const goal = state.goals.find((g) => g.id === id);
    const next = Math.max(0, Math.min(100, (goal ? goal.progress : 0) + parseInt(btn.dataset.delta)));
    await api(`/api/life/goal/${id}/progress`, "POST", { progress: next });
  } else if (act === "del-routine") {
    if (confirm("Delete this routine (and its streak history)?")) await api(`/api/life/routine/${id}`, "DELETE");
    else return;
  } else if (act === "del-task") {
    await api(`/api/life/task/${id}`, "DELETE");
  } else if (act === "del-goal") {
    if (confirm("Delete this goal?")) await api(`/api/life/goal/${id}`, "DELETE");
    else return;
  } else {
    return;
  }
  refresh();
});

// ── add forms ────────────────────────────────────────────────────────────────

$("routine-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("routine-title").value.trim();
  if (!title) return;
  await api("/api/life/routine", "POST", {
    title,
    icon: $("routine-icon").value.trim() || "✦",
    time_of_day: $("routine-time").value,
  });
  $("routine-title").value = "";
  $("routine-icon").value = "";
  refresh();
});

$("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("task-title").value.trim();
  if (!title) return;
  await api("/api/life/task", "POST", { title, priority: $("task-priority").value });
  $("task-title").value = "";
  refresh();
});

$("goal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("goal-title").value.trim();
  if (!title) return;
  const why = prompt("Why does this goal matter to you? (optional)") || "";
  await api("/api/life/goal", "POST", { title, why });
  $("goal-title").value = "";
  refresh();
});

// milestone forms are re-rendered, so delegate
document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".ms-form");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input");
  const title = input.value.trim();
  if (!title) return;
  await api(`/api/life/goal/${form.dataset.goal}/milestone`, "POST", { title });
  input.value = "";
  refresh();
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

// ── PWA service worker ───────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ── boot ─────────────────────────────────────────────────────────────────────

refresh();
setInterval(refresh, 30000); // pick up changes made via JARVIS chat
