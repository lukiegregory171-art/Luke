"""Life OS — routines, tasks (missions), and goals with streaks and XP."""

import datetime
import json
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import ROUTINES_FILE, TASKS_FILE, GOALS_FILE


# ── helpers ──────────────────────────────────────────────────────────────────

def _load(path: Path, default=None) -> Any:
    if default is None:
        default = []
    try:
        if path.exists():
            return json.loads(path.read_text())
    except Exception:
        pass
    return default


def _save(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, default=str))


def _short_id() -> str:
    return str(uuid.uuid4())[:8]


def _today() -> str:
    return str(datetime.date.today())


def _find(items: List[Dict], id_or_title: str) -> Optional[Dict]:
    """Match by exact id first, then case-insensitive title substring."""
    for item in items:
        if item.get("id") == id_or_title:
            return item
    needle = id_or_title.lower().strip()
    matches = [i for i in items if needle in i.get("title", "").lower()]
    return matches[0] if len(matches) >= 1 else None


# ── routines (daily habits with streaks) ─────────────────────────────────────

def get_routines() -> List[Dict]:
    routines = _load(ROUTINES_FILE)
    today = _today()
    for r in routines:
        r["done_today"] = bool(r.get("history", {}).get(today))
        r["streak"] = _streak(r.get("history", {}))
    order = {"morning": 0, "afternoon": 1, "evening": 2, "anytime": 3}
    return sorted(routines, key=lambda r: order.get(r.get("time_of_day", "anytime"), 3))


def add_routine(title: str, icon: str = "✦", time_of_day: str = "anytime") -> Dict:
    if time_of_day not in ("morning", "afternoon", "evening", "anytime"):
        time_of_day = "anytime"
    routines = _load(ROUTINES_FILE)
    routine = {
        "id": _short_id(),
        "title": title,
        "icon": icon,
        "time_of_day": time_of_day,
        "history": {},
        "created": datetime.datetime.now().isoformat(),
    }
    routines.append(routine)
    _save(ROUTINES_FILE, routines)
    return {"success": True, "routine": routine}


def check_routine(id_or_title: str) -> Dict:
    """Toggle today's completion for a routine (match by id or title)."""
    routines = _load(ROUTINES_FILE)
    r = _find(routines, id_or_title)
    if r is None:
        return {"success": False, "message": f"No routine matching '{id_or_title}'"}
    today = _today()
    history = r.setdefault("history", {})
    if history.get(today):
        del history[today]
        done = False
    else:
        history[today] = True
        done = True
    _save(ROUTINES_FILE, routines)
    return {
        "success": True,
        "routine": r["title"],
        "done_today": done,
        "streak": _streak(history),
    }


def delete_routine(routine_id: str) -> Dict:
    routines = _load(ROUTINES_FILE)
    filtered = [r for r in routines if r.get("id") != routine_id]
    if len(filtered) == len(routines):
        return {"success": False, "message": "Routine not found"}
    _save(ROUTINES_FILE, filtered)
    return {"success": True}


def _streak(history: Dict[str, bool]) -> int:
    """Consecutive days done, ending today — or yesterday if today is still pending."""
    day = datetime.date.today()
    if not history.get(str(day)):
        day -= datetime.timedelta(days=1)
    count = 0
    while history.get(str(day)):
        count += 1
        day -= datetime.timedelta(days=1)
    return count


# ── tasks (missions) ─────────────────────────────────────────────────────────

def get_tasks(include_done: bool = False) -> List[Dict]:
    tasks = _load(TASKS_FILE)
    if not include_done:
        tasks = [t for t in tasks if not t.get("done")]
    prio = {"high": 0, "medium": 1, "low": 2}
    return sorted(tasks, key=lambda t: (t.get("done", False), prio.get(t.get("priority"), 1), t.get("due") or "9999"))


def add_task(title: str, priority: str = "medium", due: Optional[str] = None) -> Dict:
    if priority not in ("high", "medium", "low"):
        priority = "medium"
    tasks = _load(TASKS_FILE)
    task = {
        "id": _short_id(),
        "title": title,
        "priority": priority,
        "due": due,
        "done": False,
        "created": datetime.datetime.now().isoformat(),
    }
    tasks.append(task)
    _save(TASKS_FILE, tasks)
    return {"success": True, "task": task}


def complete_task(id_or_title: str) -> Dict:
    tasks = _load(TASKS_FILE)
    t = _find([t for t in tasks if not t.get("done")], id_or_title) or _find(tasks, id_or_title)
    if t is None:
        return {"success": False, "message": f"No task matching '{id_or_title}'"}
    t["done"] = not t.get("done", False)
    t["completed_at"] = datetime.datetime.now().isoformat() if t["done"] else None
    _save(TASKS_FILE, tasks)
    return {"success": True, "task": t["title"], "done": t["done"]}


def delete_task(task_id: str) -> Dict:
    tasks = _load(TASKS_FILE)
    filtered = [t for t in tasks if t.get("id") != task_id]
    if len(filtered) == len(tasks):
        return {"success": False, "message": "Task not found"}
    _save(TASKS_FILE, filtered)
    return {"success": True}


# ── goals (dreams with milestones + progress) ────────────────────────────────

def get_goals() -> List[Dict]:
    goals = _load(GOALS_FILE)
    for g in goals:
        g["progress"] = _goal_progress(g)
    return sorted(goals, key=lambda g: (g["progress"] >= 100, g.get("target_date") or "9999"))


def _goal_progress(goal: Dict) -> int:
    milestones = goal.get("milestones", [])
    if milestones:
        done = sum(1 for m in milestones if m.get("done"))
        return round(done / len(milestones) * 100)
    return int(goal.get("progress", 0))


def add_goal(title: str, why: str = "", target_date: Optional[str] = None) -> Dict:
    goals = _load(GOALS_FILE)
    goal = {
        "id": _short_id(),
        "title": title,
        "why": why,
        "target_date": target_date,
        "progress": 0,
        "milestones": [],
        "created": datetime.datetime.now().isoformat(),
    }
    goals.append(goal)
    _save(GOALS_FILE, goals)
    return {"success": True, "goal": goal}


def set_goal_progress(id_or_title: str, progress: int) -> Dict:
    goals = _load(GOALS_FILE)
    g = _find(goals, id_or_title)
    if g is None:
        return {"success": False, "message": f"No goal matching '{id_or_title}'"}
    if g.get("milestones"):
        return {"success": False, "message": "This goal tracks progress via milestones — complete those instead."}
    g["progress"] = max(0, min(100, int(progress)))
    _save(GOALS_FILE, goals)
    return {"success": True, "goal": g["title"], "progress": g["progress"]}


def add_milestone(goal_id_or_title: str, title: str) -> Dict:
    goals = _load(GOALS_FILE)
    g = _find(goals, goal_id_or_title)
    if g is None:
        return {"success": False, "message": f"No goal matching '{goal_id_or_title}'"}
    milestone = {"id": _short_id(), "title": title, "done": False}
    g.setdefault("milestones", []).append(milestone)
    _save(GOALS_FILE, goals)
    return {"success": True, "goal": g["title"], "milestone": milestone}


def complete_milestone(goal_id_or_title: str, milestone_id_or_title: str) -> Dict:
    goals = _load(GOALS_FILE)
    g = _find(goals, goal_id_or_title)
    if g is None:
        return {"success": False, "message": f"No goal matching '{goal_id_or_title}'"}
    m = _find(g.get("milestones", []), milestone_id_or_title)
    if m is None:
        return {"success": False, "message": f"No milestone matching '{milestone_id_or_title}'"}
    m["done"] = not m.get("done", False)
    _save(GOALS_FILE, goals)
    return {
        "success": True,
        "goal": g["title"],
        "milestone": m["title"],
        "done": m["done"],
        "goal_progress": _goal_progress(g),
    }


def delete_goal(goal_id: str) -> Dict:
    goals = _load(GOALS_FILE)
    filtered = [g for g in goals if g.get("id") != goal_id]
    if len(filtered) == len(goals):
        return {"success": False, "message": "Goal not found"}
    _save(GOALS_FILE, filtered)
    return {"success": True}


# ── XP / levels ──────────────────────────────────────────────────────────────

RANKS = [
    "Rookie", "Apprentice", "Operator", "Specialist", "Agent",
    "Veteran", "Elite", "Commander", "Master", "Legend",
]


def get_xp_stats() -> Dict:
    routines = _load(ROUTINES_FILE)
    tasks = _load(TASKS_FILE)
    goals = _load(GOALS_FILE)

    routine_checks = sum(sum(1 for v in r.get("history", {}).values() if v) for r in routines)
    tasks_done = sum(1 for t in tasks if t.get("done"))
    milestones_done = sum(sum(1 for m in g.get("milestones", []) if m.get("done")) for g in goals)
    goals_done = sum(1 for g in goals if _goal_progress(g) >= 100)

    xp = routine_checks * 10 + tasks_done * 15 + milestones_done * 25 + goals_done * 100
    level = 1 + int((xp / 40) ** 0.5)
    floor_xp = 40 * (level - 1) ** 2
    next_xp = 40 * level ** 2
    best_streak = max((_streak(r.get("history", {})) for r in routines), default=0)

    return {
        "xp": xp,
        "level": level,
        "rank": RANKS[min(level - 1, len(RANKS) - 1)],
        "level_progress": round((xp - floor_xp) / max(next_xp - floor_xp, 1) * 100),
        "xp_to_next": next_xp - xp,
        "best_streak": best_streak,
        "tasks_done": tasks_done,
        "milestones_done": milestones_done,
    }


# ── overview (for the agent + dashboard) ─────────────────────────────────────

def get_life_overview() -> Dict:
    routines = get_routines()
    today = _today()
    done_today = sum(1 for r in routines if r["done_today"])
    return {
        "date": today,
        "routines": routines,
        "routines_done_today": f"{done_today}/{len(routines)}",
        "tasks": get_tasks(include_done=True),
        "goals": get_goals(),
        "stats": get_xp_stats(),
    }
