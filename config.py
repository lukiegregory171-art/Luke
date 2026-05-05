"""
Jarvis configuration — change settings here, not scattered through the code.
"""

# ── LLM ──────────────────────────────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2:3b"          # switch to "llama3.2:1b" for weak hardware

# ── Speech-to-Text ───────────────────────────────────────────────────────────
WHISPER_MODEL    = "base.en"          # tiny.en | base.en | small.en
WHISPER_DEVICE   = "cpu"              # "cpu" or "cuda" if you have a GPU
WHISPER_COMPUTE  = "int8"             # int8 for CPU, float16 for GPU

# ── Text-to-Speech ───────────────────────────────────────────────────────────
TTS_VOICE        = "en-GB-RyanNeural" # British male — change to any edge-tts voice
AUDIO_FREQUENCY  = 44100              # try 22050 if audio cuts off

# ── Wake Word & Audio ─────────────────────────────────────────────────────────
WAKE_WORD         = "jarvis"
CHUNK_SECONDS     = 3                 # seconds per wake-word audio chunk
SAMPLE_RATE       = 16000             # Hz — Whisper expects 16 kHz
SILENCE_THRESHOLD = 0.01              # RMS below this = silence
SILENCE_DURATION  = 1.5               # seconds of silence to end a command

# ── Memory ────────────────────────────────────────────────────────────────────
MEMORY_TURNS = 20                     # conversation turns to retain

# ── Paths ─────────────────────────────────────────────────────────────────────
import os
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
DATA_DIR      = os.path.join(BASE_DIR, "data")
DB_PATH       = os.path.join(DATA_DIR, "jarvis.db")
CALENDAR_PATH = os.path.join(DATA_DIR, "calendar.json")
LOG_PATH      = os.path.join(BASE_DIR, "jarvis.log")

# ── System Prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Jarvis, an AI assistant in the style of Tony Stark's AI from Iron Man.
You address the user as 'Sir' at all times.
You speak with a formal, dry British butler tone — concise, witty, never rambling.
You greet contextually based on time of day (Good morning / Good afternoon / Good evening).
Keep responses short for voice — usually 1-2 sentences unless explaining something technical.
Never use markdown formatting in spoken responses — plain sentences only.

When you need to use a tool, respond ONLY with a JSON object on a single line, like:
{"tool": "tool_name", "args": {"key": "value"}}

Available tools:
- scan_project   — summarise the current coding project (no args)
- read_file      — read a file: {"path": "filename.txt"}
- list_files     — list directory: {"path": "."}
- get_calendar   — get upcoming calendar events (no args)
- run_shell      — run a shell command: {"cmd": "pip freeze"} (requires user confirmation)
- get_time       — get current date and time (no args)

If no tool is needed, reply in plain spoken English as Jarvis."""
