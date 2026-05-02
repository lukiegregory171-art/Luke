#!/usr/bin/env python3
import json
import os
import pathlib

from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from dotenv import load_dotenv

load_dotenv()
pathlib.Path("data").mkdir(exist_ok=True)

app = Flask(__name__)
_agent = None


def _get_agent():
    global _agent
    if _agent is None:
        from jarvis.agent import JarvisAgent
        _agent = JarvisAgent()
    return _agent


@app.route("/")
def index():
    from jarvis.config import ANTHROPIC_API_KEY, GROQ_API_KEY
    api_key_set = bool(ANTHROPIC_API_KEY) or bool(GROQ_API_KEY)
    return render_template("index.html", api_key_set=api_key_set)


@app.route("/api/status")
def api_status():
    from jarvis.config import ANTHROPIC_API_KEY, GROQ_API_KEY, PROVIDER, CLAUDE_MODEL, GROQ_MODEL
    from jarvis.tools import get_current_time
    api_key_set = bool(ANTHROPIC_API_KEY) or bool(GROQ_API_KEY)
    model = GROQ_MODEL if PROVIDER == "groq" else CLAUDE_MODEL
    return jsonify({
        "api_key_set": api_key_set,
        "provider": PROVIDER,
        "model": model,
        "time": get_current_time(),
    })


@app.route("/api/chat", methods=["POST"])
def api_chat():
    from jarvis.config import ANTHROPIC_API_KEY
    if not ANTHROPIC_API_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY not set — add it to your .env file and restart."}), 503

    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Empty message"}), 400

    def generate():
        try:
            agent = _get_agent()
            full_response = agent.chat(message)
            # emit word-by-word for typewriter effect
            words = full_response.split()
            for i, word in enumerate(words):
                chunk = word + ("" if i == len(words) - 1 else " ")
                yield f"data: {json.dumps({'type': 'token', 'text': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'full': full_response})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return Response(stream_with_context(generate()), mimetype="text/event-stream", headers=headers)


@app.route("/api/schedule")
def api_schedule():
    from jarvis.tools import get_calendar_events, get_upcoming_events, get_reminders, get_current_time
    return jsonify({
        "today": get_calendar_events(),
        "upcoming": get_upcoming_events(7),
        "reminders": get_reminders(),
        "time": get_current_time(),
    })


@app.route("/api/clear", methods=["POST"])
def api_clear():
    global _agent
    if _agent:
        _agent.clear()
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"\n  ╔══════════════════════════════════╗")
    print(f"  ║   J.A.R.V.I.S. Web Interface     ║")
    print(f"  ║   Open → http://localhost:{port}   ║")
    print(f"  ╚══════════════════════════════════╝\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
