import signal
import sys

from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.prompt import Prompt

from .agent import JarvisAgent
from .voice import init_tts, init_stt, speak, listen, tts_available, stt_available
from .config import USER_NAME, VOICE_ENABLED, VOICE_RATE

console = Console()

_BANNER = r"""
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
     Just A Rather Very Intelligent System
"""

_HELP = """\
[bold cyan]Commands[/bold cyan]
  /voice   — toggle voice output on/off
  /clear   — reset conversation memory
  /help    — show this message
  /exit    — shut down J.A.R.V.I.S.
"""


def _banner() -> None:
    console.print(Panel(Text(_BANNER, style="bold cyan", justify="center"), border_style="cyan", padding=(0, 2)))


def main() -> None:
    _banner()

    # Initialise voice
    voice_on = VOICE_ENABLED
    if voice_on:
        tts_ok = init_tts(VOICE_RATE)
        stt_ok = init_stt()
    else:
        tts_ok = stt_ok = False

    console.print("[bold green]System Online[/bold green]")
    console.print(f"  Voice output : {'[green]active[/green]' if tts_ok else '[dim]text-only[/dim]'}")
    console.print(f"  Voice input  : {'[green]active[/green]' if stt_ok else '[dim]keyboard[/dim]'}")
    console.print(f"  Model        : [cyan]{__import__('jarvis.config', fromlist=['MODEL']).MODEL}[/cyan]")
    console.print()
    console.print("[dim]Type a message and press Enter. Type /help for commands.[/dim]\n")

    try:
        agent = JarvisAgent()
    except ValueError as exc:
        console.print(f"[bold red]Startup error:[/bold red] {exc}")
        sys.exit(1)

    greeting = f"Good day, {USER_NAME}. J.A.R.V.I.S. is online and at your service. How may I assist you today?"
    console.print(Panel(greeting, title="[bold cyan]J.A.R.V.I.S.[/bold cyan]", border_style="cyan"))
    if tts_ok and voice_on:
        speak(greeting)

    def _exit(sig=None, frame=None) -> None:
        farewell = f"Goodbye, {USER_NAME}. J.A.R.V.I.S. signing off."
        console.print(f"\n[bold cyan]{farewell}[/bold cyan]")
        if tts_ok and voice_on:
            speak(farewell)
        sys.exit(0)

    signal.signal(signal.SIGINT, _exit)

    while True:
        try:
            # --- input ---
            user_input: str = ""
            if stt_ok and voice_on:
                console.print("[bold yellow]Listening…[/bold yellow] (or type below)")
                spoken = listen(timeout=3)
                if spoken:
                    console.print(f"[dim]Heard:[/dim] {spoken}")
                    user_input = spoken
            if not user_input:
                user_input = Prompt.ask("[bold blue]You[/bold blue]").strip()

            if not user_input:
                continue

            # --- built-in commands ---
            cmd = user_input.lower().strip()
            if cmd in ("/exit", "/quit", "exit", "quit"):
                _exit()
            elif cmd == "/clear":
                agent.clear()
                console.print("[dim]Conversation memory cleared.[/dim]")
                continue
            elif cmd == "/voice":
                voice_on = not voice_on
                console.print(f"[dim]Voice output {'enabled' if voice_on else 'disabled'}.[/dim]")
                continue
            elif cmd == "/help":
                console.print(_HELP)
                continue

            # --- ask Jarvis ---
            console.print()
            with console.status("[bold cyan]Thinking…[/bold cyan]"):
                response = agent.chat(user_input)

            console.print(Panel(response, title="[bold cyan]J.A.R.V.I.S.[/bold cyan]", border_style="cyan"))
            if tts_ok and voice_on:
                speak(response)
            console.print()

        except KeyboardInterrupt:
            _exit()
        except Exception as exc:
            console.print(f"[bold red]Error:[/bold red] {exc}")
