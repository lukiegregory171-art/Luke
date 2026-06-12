import json
from typing import Callable, Dict, List, Optional

from .config import (
    ANTHROPIC_API_KEY, GROQ_API_KEY, PROVIDER,
    CLAUDE_MODEL, GROQ_MODEL, USER_NAME, MAX_HISTORY,
)
from .tools import execute_tool

# ── Shared tool definitions (Anthropic format) ────────────────────────────────

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
            "properties": {"date": {"type": "string", "description": "YYYY-MM-DD. Omit for today."}},
        },
    },
    {
        "name": "get_upcoming_events",
        "description": "Get all calendar events over the next N days.",
        "input_schema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Days ahead to look (default 7)."}},
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
            "properties": {"include_completed": {"type": "boolean"}},
        },
    },
    {
        "name": "set_reminder",
        "description": "Create a new reminder.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text":      {"type": "string"},
                "remind_at": {"type": "string", "description": "When — e.g. '2026-05-03 09:00'"},
                "repeat":    {"type": "string", "description": "daily, weekly, etc."},
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
        "description": "Get OS, memory, and disk information.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_web",
        "description": "Search the web via DuckDuckGo.",
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
            "properties": {"directory": {"type": "string", "description": "Path (default: .)"}},
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
        "name": "get_life_overview",
        "description": "Get the full Life OS overview: daily routines (with streaks and today's status), tasks/missions, goals with milestones and progress, and XP/level stats. ALWAYS call this when asked about routines, habits, goals, progress, or 'how am I doing'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "add_routine",
        "description": "Add a new daily routine/habit to track (e.g. workout, reading, meditation).",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string"},
                "icon":        {"type": "string", "description": "A single emoji for the routine."},
                "time_of_day": {"type": "string", "enum": ["morning", "afternoon", "evening", "anytime"]},
            },
            "required": ["title"],
        },
    },
    {
        "name": "check_routine",
        "description": "Mark a daily routine as done for today (toggles). Use when the user says they did a habit, e.g. 'I finished my workout'.",
        "input_schema": {
            "type": "object",
            "properties": {"routine": {"type": "string", "description": "Routine ID or (partial) title."}},
            "required": ["routine"],
        },
    },
    {
        "name": "add_task",
        "description": "Add a task/mission to the to-do list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":    {"type": "string"},
                "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                "due":      {"type": "string", "description": "Optional due date YYYY-MM-DD."},
            },
            "required": ["title"],
        },
    },
    {
        "name": "complete_task",
        "description": "Mark a task as completed (toggles). Match by ID or partial title.",
        "input_schema": {
            "type": "object",
            "properties": {"task": {"type": "string", "description": "Task ID or (partial) title."}},
            "required": ["task"],
        },
    },
    {
        "name": "add_goal",
        "description": "Add a long-term goal or dream to work towards.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string"},
                "why":         {"type": "string", "description": "Why this goal matters to the user."},
                "target_date": {"type": "string", "description": "Optional target date YYYY-MM-DD."},
            },
            "required": ["title"],
        },
    },
    {
        "name": "set_goal_progress",
        "description": "Set a goal's progress percentage (0-100). Only for goals without milestones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "goal":     {"type": "string", "description": "Goal ID or (partial) title."},
                "progress": {"type": "integer"},
            },
            "required": ["goal", "progress"],
        },
    },
    {
        "name": "add_milestone",
        "description": "Add a milestone (sub-step) to a goal. Goal progress is then computed from completed milestones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "goal":  {"type": "string", "description": "Goal ID or (partial) title."},
                "title": {"type": "string", "description": "Milestone title."},
            },
            "required": ["goal", "title"],
        },
    },
    {
        "name": "complete_milestone",
        "description": "Mark a goal milestone as done (toggles).",
        "input_schema": {
            "type": "object",
            "properties": {
                "goal":      {"type": "string", "description": "Goal ID or (partial) title."},
                "milestone": {"type": "string", "description": "Milestone ID or (partial) title."},
            },
            "required": ["goal", "milestone"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command and return its output.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command":   {"type": "string"},
                "safe_mode": {"type": "boolean", "description": "Restrict to safe commands (default true)."},
            },
            "required": ["command"],
        },
    },
]

SYSTEM_PROMPT = f"""You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a highly advanced \
personal AI assistant. You speak with refined, professional British wit and always address the user as \
"{USER_NAME}".

Personality:
- Calm, precise, slightly dry sense of humour
- Proactive — if you notice something relevant, mention it
- Concise in normal conversation; thorough when giving instructions

You are also {USER_NAME}'s personal life coach, running the "Life OS" dashboard of routines, \
tasks (missions), and long-term goals with streaks and XP.

Capabilities you must use actively:
- When asked about today's schedule, ALWAYS call get_calendar_events
- When asked about routines, habits, goals, tasks, or progress, ALWAYS call get_life_overview first
- When the user says they did a habit ("I worked out", "done my reading"), call check_routine
- When the user mentions something they need to do, offer to add_task; when they share an ambition, offer to add_goal and help break it into milestones
- Celebrate streaks and level-ups, and gently nudge on routines not yet done today — accountability with charm, never nagging
- When asked a factual question you are uncertain about, call search_web
- When asked about system info, call get_system_info
- Answer how-to questions directly from your knowledge with numbered steps

Keep responses tight. Use plain prose, not bullet-heavy walls of text, unless listing steps or items.
"""


# ── Helper: convert to OpenAI/Groq tool format ────────────────────────────────

def _to_openai_tools(tools: List[Dict]) -> List[Dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


# ── Claude backend ────────────────────────────────────────────────────────────

class _ClaudeBackend:
    def __init__(self) -> None:
        if not ANTHROPIC_API_KEY:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set.\n"
                "Add it to your .env file or switch to PROVIDER=groq for a free key."
            )
        import anthropic
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.history: List[Dict] = []

    def chat(self, user_message: str, on_token: Optional[Callable] = None) -> str:
        self.history.append({"role": "user", "content": user_message})
        if len(self.history) > MAX_HISTORY * 2:
            self.history = self.history[-(MAX_HISTORY * 2):]

        final_text = ""
        while True:
            response = self.client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=self.history,
            )

            text_parts, tool_uses = [], []
            for block in response.content:
                if block.type == "text":
                    text_parts.append(block.text)
                    if on_token:
                        on_token(block.text)
                elif block.type == "tool_use":
                    tool_uses.append(block)

            if text_parts:
                final_text = " ".join(text_parts)

            self.history.append({"role": "assistant", "content": response.content})

            if not tool_uses or response.stop_reason == "end_turn":
                break

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


# ── Groq backend ──────────────────────────────────────────────────────────────

class _GroqBackend:
    def __init__(self) -> None:
        if not GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY is not set.\n"
                "Get a free key at console.groq.com and add GROQ_API_KEY=... to your .env file."
            )
        from groq import Groq
        self.client = Groq(api_key=GROQ_API_KEY)
        self.history: List[Dict] = []
        self._tools = _to_openai_tools(TOOLS)

    def chat(self, user_message: str, on_token: Optional[Callable] = None) -> str:
        self.history.append({"role": "user", "content": user_message})
        if len(self.history) > MAX_HISTORY * 2:
            self.history = self.history[-(MAX_HISTORY * 2):]

        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + self.history

        while True:
            response = self.client.chat.completions.create(
                model=GROQ_MODEL,
                messages=messages,
                tools=self._tools,
                tool_choice="auto",
                max_tokens=2048,
            )

            msg = response.choices[0].message

            # Build serialisable assistant dict for history
            assistant_entry: Dict = {"role": "assistant", "content": msg.content or ""}
            if msg.tool_calls:
                assistant_entry["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in msg.tool_calls
                ]
            messages.append(assistant_entry)
            self.history.append(assistant_entry)

            if not msg.tool_calls:
                return msg.content or ""

            # Execute tools and add results
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except Exception:
                    args = {}
                result = execute_tool(tc.function.name, args)
                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                }
                messages.append(tool_msg)
                self.history.append(tool_msg)

    def clear(self) -> None:
        self.history = []


# ── Public interface ───────────────────────────────────────────────────────────

class JarvisAgent:
    """Thin wrapper — delegates to Claude or Groq backend based on PROVIDER setting."""

    def __init__(self) -> None:
        if PROVIDER == "groq":
            self._backend = _GroqBackend()
            self.provider = "groq"
            self.model = GROQ_MODEL
        else:
            self._backend = _ClaudeBackend()
            self.provider = "claude"
            self.model = CLAUDE_MODEL

    def chat(self, user_message: str, on_token: Optional[Callable] = None) -> str:
        return self._backend.chat(user_message, on_token)

    def clear(self) -> None:
        self._backend.clear()
