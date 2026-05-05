# J.A.R.V.I.S. — Local Voice AI Assistant

A voice-activated AI assistant inspired by Tony Stark's JARVIS. Runs 100% locally on Windows 10/11. Zero paid services, no API keys, no subscriptions.

---

## What It Does

- Wake-word activation: say **"Jarvis"** to get its attention
- Responds in a formal British butler personality ("Yes, Sir?")
- Answers questions using a local LLM (Ollama + llama3.2:3b)
- Reads your calendar (Outlook or local `calendar.json`)
- Scans your current project and answers coding questions
- Lists/reads/opens files, runs shell commands (with confirmation)
- Persists conversation history across sessions (SQLite)
- Fully interruptible voice output

---

## Requirements

- Windows 10 or 11
- Python 3.11+ — [python.org](https://www.python.org/downloads/) (check **"Add Python to PATH"** during install)
- Ollama — [ollama.com](https://ollama.com) (free, installs like any Windows app)
- A microphone
- Internet connection for first run only (downloads Whisper model ~150 MB, edge-tts voices)

---

## Setup — Step by Step

### 1. Install Python 3.11+

Download from [python.org](https://www.python.org/downloads/).
During install, **check "Add Python to PATH"** — this is critical.

Verify in PowerShell:
```powershell
python --version
```

### 2. Install Ollama

Download and install from [ollama.com](https://ollama.com).
Ollama runs as a background service after install.

### 3. Pull the LLM Model

Open PowerShell and run:
```powershell
ollama pull llama3.2:3b
```

This downloads ~2 GB. On slow or weak hardware, use the 1B model instead:
```powershell
ollama pull llama3.2:1b
```
Then change `OLLAMA_MODEL` in `config.py` to `"llama3.2:1b"`.

### 4. Install Python Dependencies

In the project folder, open PowerShell and run:
```powershell
pip install -r requirements.txt
```

### 5. Launch Jarvis

Double-click **`start_jarvis.bat`** — or from PowerShell:
```powershell
python jarvis.py
```

Jarvis will greet you and start listening for the wake word.

---

## Calendar Setup

### Option A — Microsoft Outlook (if installed)
No setup needed. Jarvis reads your Outlook calendar automatically via `pywin32`.

### Option B — Local `data/calendar.json`
Edit `data/calendar.json` to add your events. Format:
```json
[
  {
    "title": "Team Meeting",
    "datetime": "2026-05-10T14:00:00",
    "notes": "Dial-in link in email."
  }
]
```

---

## Usage Examples

| Say | Jarvis Does |
|---|---|
| "Jarvis, what time is it?" | Tells time with butler flair |
| "Jarvis, what's on my schedule?" | Reads upcoming calendar events |
| "Jarvis, what are we working on?" | Scans project dir, reads README & git log |
| "Jarvis, list the files here" | Lists current directory contents |
| "Jarvis, read requirements.txt" | Reads and summarises the file |
| "Jarvis, run pip freeze" | Asks for voice confirmation, then runs |
| "Jarvis, how do I parse JSON in Python?" | Answers with a code snippet |

---

## Project Structure

```
jarvis/
├── jarvis.py          # Main loop — wake word → command → response
├── config.py          # All settings in one place
├── modules/
│   ├── ears.py        # Microphone capture + Whisper STT
│   ├── voice.py       # edge-tts / pyttsx3 speech output
│   ├── brain.py       # Ollama LLM + tool call routing
│   ├── tools.py       # Calendar, files, shell, project scanner
│   └── memory.py      # SQLite conversation history
├── data/
│   ├── calendar.json  # Local calendar (edit manually)
│   └── jarvis.db      # Auto-created conversation database
├── requirements.txt
├── start_jarvis.bat   # One-click Windows launcher
└── README.md
```

---

## Troubleshooting

### "I'm afraid my cognitive systems are offline, Sir"
Ollama is not running. Open PowerShell and run:
```powershell
ollama serve
```
Or restart the Ollama app from the system tray.

### Microphone not detected / no audio input
- Open Windows Settings → Privacy → Microphone → Allow apps to access microphone
- Check that your mic is set as the default input device in Sound settings
- Try running: `python -c "import sounddevice; print(sounddevice.query_devices())"`
- If you see no input devices, install your mic driver or use a USB mic

### Very slow responses
Switch to the 1B model. In `config.py`, change:
```python
OLLAMA_MODEL = "llama3.2:1b"
```
Then run: `ollama pull llama3.2:1b`

### edge-tts not working (no voice output)
Jarvis automatically falls back to the offline Windows voice (pyttsx3/SAPI).
This sounds more robotic but works without internet.

### Outlook calendar not reading
- Ensure Outlook is installed and signed in
- Run Python as the same user that has Outlook open
- As a fallback, use `data/calendar.json` — Jarvis checks it automatically

### `pip install` fails on pywin32
Run PowerShell **as Administrator** and retry. Or install manually:
```powershell
pip install pywin32
python Scripts/pywin32_postinstall.py -install
```

### Audio plays but cuts off immediately
pygame mixer issue. Try changing `AUDIO_FREQUENCY` in `config.py` from `44100` to `22050`.

---

## Configuration

All tuneable settings live in `config.py`:

| Setting | Default | Description |
|---|---|---|
| `OLLAMA_MODEL` | `llama3.2:3b` | LLM model name |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `WHISPER_MODEL` | `base.en` | Whisper model size |
| `TTS_VOICE` | `en-GB-RyanNeural` | edge-tts voice ID |
| `WAKE_WORD` | `jarvis` | Wake word (lowercase) |
| `CHUNK_SECONDS` | `3` | Audio chunk size for wake word |
| `SILENCE_THRESHOLD` | `0.01` | Mic volume threshold for silence |
| `MEMORY_TURNS` | `20` | Conversation turns to keep |

---

## Completely Free — How?

| Component | Service | Cost |
|---|---|---|
| LLM | Ollama (local) | Free |
| Speech-to-text | faster-whisper (local) | Free |
| Text-to-speech | Microsoft Edge TTS (online, no key) | Free |
| TTS fallback | Windows SAPI via pyttsx3 (local) | Free |
| Calendar | pywin32 Outlook or local JSON | Free |
| Storage | SQLite (built into Python) | Free |

No accounts, no credit cards, no rate limits.
