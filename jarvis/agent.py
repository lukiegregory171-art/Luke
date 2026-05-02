import json
from typing import Callable, List, Dict, Optional

import anthropic

from .config import ANTHROPIC_API_KEY, USER_NAME, MODEL, MAX_HISTORY
from .tools import execute_tool

# ── Tool schemas ──────────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "get_current_time",
        "description": "Get the current date and time.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_calendar_events",
        "description": "Get calendar events for a specific date (defaults to today if omitted).",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "YYYY-MM-DD. Omit for today."}
            },
        },
    },
    {
        "name": "get_upcoming_events",
        "description": "Get all calendar events over the next N days.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "How many days ahead to look (default 7)."}
            },
        },
    },
    {
        "name": "add_calendar_event",
        "description": "Add a new event to the calendar.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":            {"type": "string"},
                "date":             {"type": "string", "description": "YYYY-MM-DD"},
                "time":             {"type": "string", "description": "HH:MM (24-hour)"},
                "duration_minutes": {"type": "integer"},
                "notes":            {"type": "string"},
            },
            "required": ["title", "date"],
        },
    },
    {
        "name": "delete_calendar_event",
        "description": "Delete a calendar event by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {"event_id": {"type": "string"}},
            "required": ["event_id"],
        },
    },
    {
        "name": "get_reminders",
        "description": "Get all active (incomplete) reminders.",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_completed": {"type": "boolean", "description": "Also return completed reminders."}
            },
        },
    },
    {
        "name": "set_reminder",
        "description": "Create a new reminder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text":      {"type": "string", "description": "What to be reminded about."},
                "remind_at": {"type": "string", "description": "When — e.g. '2026-05-03 09:00' or 'tomorrow morning'."},
                "repeat":    {"type": "string", "description": "Optional repeat: daily, weekly, etc."},
            },
            "required": ["text", "remind_at"],
        },
    },
    {
        "name": "complete_reminder",
        "description": "Mark a reminder as done.",
        "input_schema": {
            "type": "object",
            "properties": {"reminder_id": {"type": "string"}},
            "required": ["reminder_id"],
        },
    },
    {
        "name": "get_system_info",
        "description": "Get OS, memory, and disk information for this machine.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_web",
        "description": "Search the web via DuckDuckGo for up-to-date information.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "list_files",
        "description": "List files and folders in a directory.",
        "input_schema": {
            "type": "object",
            "properties": {
                "directory": {"type": "string", "description": "Path (default: current directory)."}
            },
        },
    },
    {
        "name": "read_file",
        "description": "Read the text content of a file.",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command on the system and return its output.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command":   {"type": "string", "description": "The shell command to execute."},
                "safe_mode": {
                    "type": "boolean",
                    "description": "Restrict to safe read-only commands (default true).",
                },
            },
            "required": ["command"],
        },
    },
]

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = f"""You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a highly advanced \
personal AI assistant. You speak with refined, professional British wit and always address the user as \
"{USER_NAME}".

Personality:
- Calm, precise, slightly dry sense of humour
- Proactive — if you notice something relevant, mention it
- Concise in normal conversation; thorough when giving instructions
- Never say "I cannot" unless truly impossible — find a way

Capabilities you must use actively:
- When asked about today's schedule, ALWAYS call get_calendar_events
- When asked a factual question you are uncertain about, call search_web
- When asked about system info, call get_system_info
- For step-by-step how-to questions (e.g. "how do I open a terminal in Claude Code"), \
  answer directly from your knowledge with numbered steps — no need to search

Keep responses tight. Use plain prose, not bullet-heavy walls of text, unless listing steps or items.
"""


# ── Agent ─────────────────────────────────────────────────────────────────────

class JarvisAgent:
    def __init__(self) -> None:
        if not ANTHROPIC_API_KEY:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. "
                "Add it to a .env file (copy .env.example) or export it as an environment variable."
            )
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.history: List[Dict] = []

    def chat(self, user_message: str, on_token: Optional[Callable[[str], None]] = None) -> str:
        self.history.append({"role": "user", "content": user_message})
        if len(self.history) > MAX_HISTORY * 2:
            self.history = self.history[-(MAX_HISTORY * 2):]

        final_text = ""

        while True:
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=self.history,
            )

            text_parts: List[str] = []
            tool_uses = []

            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                    if on_token:
                        on_token(block.text)
                elif block.type == "tool_use":
                    tool_uses.append(block)

            if text_parts:
                final_text = " ".join(text_parts)

            # Append the assistant turn to history (raw content blocks)
            self.history.append({"role": "assistant", "content": response.content})

            if not tool_uses or response.stop_reason == "end_turn":
                break

            # Execute tools and feed results back
            tool_results = [
                {
                    "type": "tool_result",
                    "tool_use_id": tu.id,
                    "content": json.dumps(execute_tool(tu.name, tu.input), default=str),
                }
                for tu in tool_uses
            ]
            self.history.append({"role": "user", "content": tool_results})

        return final_text

    def clear(self) -> None:
        self.history = []
