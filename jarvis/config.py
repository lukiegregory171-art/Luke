import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
USER_NAME = os.getenv("USER_NAME", "Sir")
VOICE_ENABLED = os.getenv("VOICE_ENABLED", "true").lower() == "true"
VOICE_RATE = int(os.getenv("VOICE_RATE", "160"))
MODEL = "claude-opus-4-7"
MAX_HISTORY = 30

CALENDAR_FILE = DATA_DIR / "calendar.json"
REMINDERS_FILE = DATA_DIR / "reminders.json"
