from typing import Optional

_tts_engine = None
_tts_available = False
_stt_available = False


def init_tts(rate: int = 160) -> bool:
    global _tts_engine, _tts_available
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate", rate)
        engine.setProperty("volume", 0.9)
        # Prefer a British/English male voice
        voices = engine.getProperty("voices") or []
        for voice in voices:
            name = (voice.name or "").lower()
            if any(k in name for k in ("english", "en_gb", "uk", "british")):
                engine.setProperty("voice", voice.id)
                break
        # Test that it actually works
        engine.say(" ")
        engine.runAndWait()
        _tts_engine = engine
        _tts_available = True
        return True
    except Exception:
        _tts_engine = None
        _tts_available = False
        return False


def init_stt() -> bool:
    global _stt_available
    try:
        import speech_recognition as sr
        import pyaudio  # noqa: F401 — just check it's importable
        _stt_available = True
        return True
    except Exception:
        _stt_available = False
        return False


def speak(text: str) -> bool:
    if not _tts_available or not _tts_engine or not text:
        return False
    try:
        _tts_engine.say(text)
        _tts_engine.runAndWait()
        return True
    except Exception:
        return False


def listen(timeout: int = 5, phrase_timeout: int = 12) -> Optional[str]:
    if not _stt_available:
        return None
    try:
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 300
        with sr.Microphone() as source:
            recognizer.adjust_for_ambient_noise(source, duration=0.3)
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_timeout)
        return recognizer.recognize_google(audio)
    except Exception:
        return None


def tts_available() -> bool:
    return _tts_available


def stt_available() -> bool:
    return _stt_available
