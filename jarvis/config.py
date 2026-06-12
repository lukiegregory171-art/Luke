import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# ── API keys ──────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY      = os.getenv("GROQ_API_KEY", "")

# PROVIDER = "groq"   → free, powered by Llama 3.3 70B  (get key: console.groq.com)
# PROVIDER = "claude" → paid, powered by Claude Opus     (get key: console.anthropic.com)
PROVIDER = os.getenv("PROVIDER", "groq" if GROQ_API_KEY else "claude")

# ── Models ────────────────────────────────────────────────────────────────────
CLAUDE_MODEL = "claude-opus-4-7"
GROQ_MODEL   = "llama-3.3-70b-versatile"

# ── User / voice ──────────────────────────────────────────────────────────────
USER_NAME    = os.getenv("USER_NAME", "Sir")
VOICE_ENABLED = os.getenv("VOICE_ENABLED", "true").lower() == "true"
VOICE_RATE   = int(os.getenv("VOICE_RATE", "160"))
MAX_HISTORY  = 30

CALENDAR_FILE  = DATA_DIR / "calendar.json"
REMINDERS_FILE = DATA_DIR / "reminders.json"
ROUTINES_FILE  = DATA_DIR / "routines.json"
TASKS_FILE     = DATA_DIR / "tasks.json"
GOALS_FILE     = DATA_DIR / "goals.json"
