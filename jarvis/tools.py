import json
import subprocess
import datetime
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from .config import CALENDAR_FILE, REMINDERS_FILE


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


# ── time ─────────────────────────────────────────────────────────────────────

def get_current_time() -> Dict:
    now = datetime.datetime.now()
    return {
        "datetime": now.isoformat(),
        "date": now.strftime("%A, %B %d, %Y"),
        "time": now.strftime("%I:%M %p"),
        "day_of_week": now.strftime("%A"),
        "iso_date": str(now.date()),
    }


# ── calendar ──────────────────────────────────────────────────────────────────

def get_calendar_events(date: Optional[str] = None) -> List[Dict]:
    events = _load(CALENDAR_FILE)
    target = date if date else str(datetime.date.today())
    found = [e for e in events if e.get("date") == target]
    return sorted(found, key=lambda x: x.get("time", "00:00"))


def get_upcoming_events(days: int = 7) -> List[Dict]:
    events = _load(CALENDAR_FILE)
    today = datetime.date.today()
    end = today + datetime.timedelta(days=days)
    result = []
    for e in events:
        try:
            if today <= datetime.date.fromisoformat(e["date"]) <= end:
                result.append(e)
        except Exception:
            pass
    return sorted(result, key=lambda x: (x.get("date", ""), x.get("time", "")))


def add_calendar_event(
    title: str,
    date: str,
    time: str = "00:00",
    duration_minutes: int = 60,
    notes: str = "",
) -> Dict:
    events = _load(CALENDAR_FILE)
    event = {
        "id": _short_id(),
        "title": title,
        "date": date,
        "time": time,
        "duration_minutes": duration_minutes,
        "notes": notes,
        "created": datetime.datetime.now().isoformat(),
    }
    events.append(event)
    _save(CALENDAR_FILE, events)
    return {"success": True, "event": event}


def delete_calendar_event(event_id: str) -> Dict:
    events = _load(CALENDAR_FILE)
    filtered = [e for e in events if e.get("id") != event_id]
    if len(filtered) == len(events):
        return {"success": False, "message": "Event not found"}
    _save(CALENDAR_FILE, filtered)
    return {"success": True, "message": f"Event {event_id} deleted"}


# ── reminders ────────────────────────────────────────────────────────────────

def get_reminders(include_completed: bool = False) -> List[Dict]:
    reminders = _load(REMINDERS_FILE)
    if not include_completed:
        reminders = [r for r in reminders if not r.get("completed", False)]
    return reminders


def set_reminder(text: str, remind_at: str, repeat: Optional[str] = None) -> Dict:
    reminders = _load(REMINDERS_FILE)
    reminder = {
        "id": _short_id(),
        "text": text,
        "remind_at": remind_at,
        "repeat": repeat,
        "completed": False,
        "created": datetime.datetime.now().isoformat(),
    }
    reminders.append(reminder)
    _save(REMINDERS_FILE, reminders)
    return {"success": True, "reminder": reminder}


def complete_reminder(reminder_id: str) -> Dict:
    reminders = _load(REMINDERS_FILE)
    for r in reminders:
        if r.get("id") == reminder_id:
            r["completed"] = True
            r["completed_at"] = datetime.datetime.now().isoformat()
            _save(REMINDERS_FILE, reminders)
            return {"success": True}
    return {"success": False, "message": "Reminder not found"}


# ── system ───────────────────────────────────────────────────────────────────

def get_system_info() -> Dict:
    import platform, shutil

    info: Dict[str, Any] = {
        "os": platform.system(),
        "os_release": platform.release(),
        "machine": platform.machine(),
        "hostname": platform.node(),
        "python": platform.python_version(),
    }
    try:
        total, used, free = shutil.disk_usage("/")
        info["disk"] = {
            "total_gb": round(total / 2**30, 1),
            "used_gb": round(used / 2**30, 1),
            "free_gb": round(free / 2**30, 1),
        }
    except Exception:
        pass
    try:
        with open("/proc/meminfo") as f:
            mem: Dict[str, int] = {}
            for line in f:
                k, *v = line.split()
                if k.rstrip(":") in ("MemTotal", "MemFree", "MemAvailable"):
                    mem[k.rstrip(":")] = int(v[0]) // 1024
        info["memory_mb"] = mem
    except Exception:
        pass
    return info


# ── web search ───────────────────────────────────────────────────────────────

def search_web(query: str) -> Dict:
    try:
        url = "https://api.duckduckgo.com/"
        params = {"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"}
        resp = requests.get(url, params=params, timeout=10, headers={"User-Agent": "JARVIS/1.0"})
        data = resp.json()
        return {
            "query": query,
            "abstract": data.get("Abstract", ""),
            "source": data.get("AbstractSource", ""),
            "answer": data.get("Answer", ""),
            "related": [
                {"title": t["Text"], "url": t.get("FirstURL", "")}
                for t in data.get("RelatedTopics", [])[:5]
                if isinstance(t, dict) and t.get("Text")
            ],
        }
    except Exception as exc:
        return {"error": str(exc), "query": query}


# ── file ops ─────────────────────────────────────────────────────────────────

def list_files(directory: str = ".") -> Dict:
    try:
        path = Path(directory).expanduser()
        if not path.exists():
            return {"error": f"Not found: {directory}"}
        items = [
            {
                "name": p.name,
                "type": "dir" if p.is_dir() else "file",
                "size": p.stat().st_size if p.is_file() else None,
            }
            for p in sorted(path.iterdir())
        ]
        return {"directory": str(path), "items": items}
    except PermissionError:
        return {"error": "Permission denied"}
    except Exception as exc:
        return {"error": str(exc)}


def read_file(path: str, max_chars: int = 6000) -> Dict:
    try:
        p = Path(path).expanduser()
        if not p.is_file():
            return {"error": f"Not a file: {path}"}
        content = p.read_text()
        return {
            "path": str(p),
            "content": content[:max_chars],
            "truncated": len(content) > max_chars,
            "total_chars": len(content),
        }
    except Exception as exc:
        return {"error": str(exc)}


# ── shell commands ────────────────────────────────────────────────────────────

_SAFE = {
    "ls", "pwd", "whoami", "date", "uptime", "df", "free",
    "ps", "echo", "cat", "which", "find", "grep", "git",
    "python3", "pip3", "mkdir", "touch", "wc", "head", "tail",
}


def run_command(command: str, safe_mode: bool = True) -> Dict:
    if not command.strip():
        return {"error": "Empty command"}
    base = command.strip().split()[0]
    if safe_mode and base not in _SAFE:
        return {
            "error": f"'{base}' is not in the safe-command list.",
            "hint": "Pass safe_mode=false to override, or ask me to run it directly.",
        }
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        return {
            "command": command,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
            "return_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Timed out after 30 s"}
    except Exception as exc:
        return {"error": str(exc)}


# ── dispatcher ────────────────────────────────────────────────────────────────

_DISPATCH = {
    "get_current_time":      lambda a: get_current_time(),
    "get_calendar_events":   lambda a: get_calendar_events(a.get("date")),
    "get_upcoming_events":   lambda a: get_upcoming_events(a.get("days", 7)),
    "add_calendar_event":    lambda a: add_calendar_event(**a),
    "delete_calendar_event": lambda a: delete_calendar_event(a["event_id"]),
    "get_reminders":         lambda a: get_reminders(a.get("include_completed", False)),
    "set_reminder":          lambda a: set_reminder(**a),
    "complete_reminder":     lambda a: complete_reminder(a["reminder_id"]),
    "get_system_info":       lambda a: get_system_info(),
    "search_web":            lambda a: search_web(a["query"]),
    "list_files":            lambda a: list_files(a.get("directory", ".")),
    "read_file":             lambda a: read_file(a["path"]),
    "run_command":           lambda a: run_command(a["command"], a.get("safe_mode", True)),
}


def execute_tool(name: str, args: Dict) -> Any:
    fn = _DISPATCH.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return fn(args)
    except Exception as exc:
        return {"error": f"Tool error: {exc}"}
